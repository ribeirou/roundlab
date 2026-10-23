import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { normalizeCorpus } from '../src/normalize.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');

export const OFFICIAL_QUALIFIER_FOLDERS = [
  { qualifier: 'c1', label: 'Classificatória 1', folderId: '1yvp6ZBc6umzt0avoGRtEtrrinSnc0Cpk' },
  { qualifier: 'c2', label: 'Classificatória 2', folderId: '17R43ZOHytkG6Yy9-ZuygxgzAFOX-ITV1' },
  { qualifier: 'c3', label: 'Classificatória 3', folderId: '1GwFEdQPZ6hHRxTk4CC19swik_WDPm0kB' },
  { qualifier: 'c4', label: 'Classificatória 4', folderId: '1UFMg9gx_s6GfGsa7edvs7d_RsCOh-e1y' },
];

async function fetchWithRetry(url, retries = 3) {
  let lastError;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'RoundLab-Importer/1.0',
        },
      });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status} (${res.statusText}) for ${url}`);
      }
      return await res.text();
    } catch (err) {
      lastError = err;
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, 400 * attempt));
      }
    }
  }
  throw lastError;
}

async function listDriveFolderFiles(folderId) {
  const url = `https://drive.google.com/embeddedfolderview?id=${folderId}#list`;
  const html = await fetchWithRetry(url);
  const files = [];
  const seenIds = new Set();
  const regex = /id="entry-([^"]+)"[\s\S]*?<div class="flip-entry-title">([^<]+)<\/div>/g;
  let match;
  while ((match = regex.exec(html)) !== null) {
    const driveId = match[1].trim();
    const file = match[2].trim();
    if (!seenIds.has(driveId) && file.toLowerCase().endsWith('.json')) {
      seenIds.add(driveId);
      files.push({ driveId, file });
    }
  }

  // Verificar se há indício de paginação na listagem embutida (embeddedfolderview tem limite de 500 itens)
  const possiblyTruncated = files.length >= 500 || html.includes('nextPageToken');
  return {
    files,
    observedCount: files.length,
    paginationDetected: possiblyTruncated,
  };
}

async function mapConcurrent(items, concurrency, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  async function next() {
    while (cursor < items.length) {
      const idx = cursor++;
      results[idx] = await worker(items[idx], idx);
    }
  }
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, () => next());
  await Promise.all(runners);
  return results;
}

function sha256Hex(content) {
  return crypto.createHash('sha256').update(content).digest('hex');
}

async function syncSharedModules() {
  const srcDir = path.join(ROOT_DIR, 'src');
  const pubLibDir = path.join(ROOT_DIR, 'public', 'lib');
  await fs.mkdir(pubLibDir, { recursive: true });
  const files = await fs.readdir(srcDir);
  for (const file of files) {
    if (file.endsWith('.mjs')) {
      await fs.copyFile(path.join(srcDir, file), path.join(pubLibDir, file));
    }
  }
}

export async function runImport({ skipRemoteListingIfLocalExists = false } = {}) {
  const rawBaseDir = path.join(ROOT_DIR, 'data', 'raw');
  const manifestPath = path.join(ROOT_DIR, 'data', 'manifest.json');
  const qualityReportPath = path.join(ROOT_DIR, 'data', 'quality-report.json');
  const publicDataDir = path.join(ROOT_DIR, 'public', 'data');
  const publicMatchesPath = path.join(publicDataDir, 'matches.json');
  const teamBindingsPath = path.join(ROOT_DIR, 'data', 'team-bindings.json');

  await fs.mkdir(rawBaseDir, { recursive: true });
  await fs.mkdir(publicDataDir, { recursive: true });

  let existingManifest = null;
  if (existsSync(manifestPath)) {
    try {
      existingManifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
    } catch {
      existingManifest = null;
    }
  }

  const existingDriveMap = new Map();
  if (existingManifest?.files && Array.isArray(existingManifest.files)) {
    for (const item of existingManifest.files) {
      existingDriveMap.set(`${item.qualifier}/${item.file}`, item.driveId);
    }
  }

  const coverageByQualifier = {};
  const remoteEntries = [];

  for (const q of OFFICIAL_QUALIFIER_FOLDERS) {
    const qDir = path.join(rawBaseDir, q.qualifier);
    await fs.mkdir(qDir, { recursive: true });

    let listed = null;
    if (!skipRemoteListingIfLocalExists) {
      try {
        listed = await listDriveFolderFiles(q.folderId);
      } catch (err) {
        console.warn(`Aviso: falha ao listar pasta remota ${q.qualifier}: ${err.message}`);
      }
    }

    if (listed && listed.files.length > 0) {
      coverageByQualifier[q.qualifier] = {
        label: q.label,
        folderId: q.folderId,
        observedRemoteFiles: listed.observedCount,
        paginationDetected: listed.paginationDetected,
        source: 'remote_drive_listing',
      };
      for (const f of listed.files) {
        remoteEntries.push({
          qualifier: q.qualifier,
          file: f.file,
          driveId: f.driveId,
          localPath: path.join(qDir, f.file),
        });
      }
    } else {
      const localFiles = (await fs.readdir(qDir)).filter((f) => f.toLowerCase().endsWith('.json'));
      coverageByQualifier[q.qualifier] = {
        label: q.label,
        folderId: q.folderId,
        observedRemoteFiles: localFiles.length,
        paginationDetected: false,
        source: 'local_cache_fallback',
      };
      for (const file of localFiles) {
        remoteEntries.push({
          qualifier: q.qualifier,
          file,
          driveId: existingDriveMap.get(`${q.qualifier}/${file}`) || '',
          localPath: path.join(qDir, file),
        });
      }
    }
  }

  const missingDownloads = remoteEntries.filter((e) => !existsSync(e.localPath) && e.driveId);
  if (missingDownloads.length > 0) {
    console.log(`Baixando ${missingDownloads.length} arquivos oficiais do Google Drive...`);
    let downloaded = 0;
    await mapConcurrent(missingDownloads, 10, async (item) => {
      const downloadUrl = `https://drive.google.com/uc?export=download&id=${item.driveId}`;
      const content = await fetchWithRetry(downloadUrl);
      await fs.writeFile(item.localPath, content, 'utf8');
      downloaded++;
      if (downloaded % 25 === 0 || downloaded === missingDownloads.length) {
        console.log(`  Progresso: ${downloaded}/${missingDownloads.length}`);
      }
    });
  }

  let teamBindings = {};
  if (existsSync(teamBindingsPath)) {
    try {
      teamBindings = JSON.parse(await fs.readFile(teamBindingsPath, 'utf8'));
    } catch (err) {
      console.warn(`Aviso: erro ao ler team-bindings.json: ${err.message}`);
    }
  }

  const corpusEntries = [];
  const manifestFiles = [];

  for (const item of remoteEntries) {
    const rawBuffer = await fs.readFile(item.localPath);
    const sha256 = sha256Hex(rawBuffer);
    const source = {
      file: item.file,
      qualifier: item.qualifier,
      driveId: item.driveId,
      sha256,
    };

    let raw = null;
    let parseError = null;
    try {
      raw = JSON.parse(rawBuffer.toString('utf8'));
    } catch (err) {
      parseError = err.message;
    }

    corpusEntries.push({ raw, source, parseError });
    manifestFiles.push({
      file: item.file,
      qualifier: item.qualifier,
      driveId: item.driveId,
      sha256,
      matchId: raw?.matchInfo?.matchId ?? null,
    });
  }

  const { matches, report } = normalizeCorpus(corpusEntries, teamBindings);

  const manifest = {
    generatedAt: new Date().toISOString(),
    qualifiers: coverageByQualifier,
    totalFiles: manifestFiles.length,
    files: manifestFiles,
  };

  const fullQualityReport = {
    generatedAt: manifest.generatedAt,
    coverage: coverageByQualifier,
    ...report,
  };

  await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
  await fs.writeFile(qualityReportPath, JSON.stringify(fullQualityReport, null, 2) + '\n', 'utf8');
  await fs.writeFile(publicMatchesPath, JSON.stringify(matches, null, 2) + '\n', 'utf8');
  await syncSharedModules();

  console.log(
    `Importação concluída: ${matches.length} partidas válidas de ${manifestFiles.length} arquivos (duplicadas: ${report.duplicates.length}, excluídas: ${report.excluded.length}, equipes ambíguas: ${report.ambiguousTeams.length}).`
  );

  return { manifest, matches, report: fullQualityReport };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runImport().catch((err) => {
    console.error('Erro na importação:', err);
    process.exitCode = 1;
  });
}
