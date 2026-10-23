import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');
const DIST_DIR = path.join(ROOT_DIR, 'dist');

async function copyDirRecursive(srcDir, destDir) {
  await fs.mkdir(destDir, { recursive: true });
  const entries = await fs.readdir(srcDir, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(srcDir, entry.name);
    const destPath = path.join(destDir, entry.name);
    if (entry.isDirectory()) {
      await copyDirRecursive(srcPath, destPath);
    } else if (entry.isFile()) {
      await fs.copyFile(srcPath, destPath);
    }
  }
}

export async function buildDist() {
  const matchesPath = path.join(ROOT_DIR, 'public', 'data', 'matches.json');
  if (!existsSync(matchesPath)) {
    throw new Error(
      'Arquivo public/data/matches.json não encontrado. Execute "npm run import" antes de empacotar.'
    );
  }

  await fs.rm(DIST_DIR, { recursive: true, force: true });
  await fs.mkdir(DIST_DIR, { recursive: true });

  // Copiar aplicação estática e dados derivados (sem dados brutos de data/raw/)
  await copyDirRecursive(path.join(ROOT_DIR, 'public'), path.join(DIST_DIR, 'public'));
  await copyDirRecursive(path.join(ROOT_DIR, 'src'), path.join(DIST_DIR, 'src'));
  await copyDirRecursive(path.join(ROOT_DIR, 'docs'), path.join(DIST_DIR, 'docs'));

  await fs.mkdir(path.join(DIST_DIR, 'scripts'), { recursive: true });
  await fs.copyFile(
    path.join(ROOT_DIR, 'scripts', 'serve.mjs'),
    path.join(DIST_DIR, 'scripts', 'serve.mjs')
  );

  await fs.mkdir(path.join(DIST_DIR, 'data'), { recursive: true });
  if (existsSync(path.join(ROOT_DIR, 'data', 'quality-report.json'))) {
    await fs.copyFile(
      path.join(ROOT_DIR, 'data', 'quality-report.json'),
      path.join(DIST_DIR, 'data', 'quality-report.json')
    );
  }

  for (const topFile of ['README.md', 'LICENSE']) {
    if (existsSync(path.join(ROOT_DIR, topFile))) {
      await fs.copyFile(path.join(ROOT_DIR, topFile), path.join(DIST_DIR, topFile));
    }
  }

  const distPkg = {
    name: 'roundlab-prototype',
    version: '0.1.0',
    private: true,
    description:
      'Pacote autônomo de demonstração do RoundLab (fontes + dados derivados auditados, sem dependência de Google Drive ou dados brutos)',
    type: 'module',
    engines: {
      node: '>=24.0.0',
    },
    scripts: {
      start: 'node scripts/serve.mjs',
      serve: 'node scripts/serve.mjs',
    },
    license: 'MIT',
  };

  await fs.writeFile(
    path.join(DIST_DIR, 'package.json'),
    JSON.stringify(distPkg, null, 2) + '\n',
    'utf8'
  );

  console.log(`Pacote autônomo gerado em: ${DIST_DIR}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  buildDist().catch((err) => {
    console.error('Erro ao empacotar dist/:', err);
    process.exitCode = 1;
  });
}
