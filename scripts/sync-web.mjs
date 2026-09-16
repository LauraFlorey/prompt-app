import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// Shared app files have one source here. Keep legacy downloads and the art
// website's other pages outside this list; syncing never removes files.
const files = [
    'index.html', 'app.js', 'storage-manager.js', 'model-registry.js',
    'version-checker.js', 'sw.js', 'manifest.json', 'tailwind.css',
    'styles/app.css', 'styles/fonts.css', 'styles/bootstrap-icons.css'
];
const root = fileURLToPath(new URL('../', import.meta.url));
const args = process.argv.slice(2);
const check = args.includes('--check');
const siteIndex = args.indexOf('--site');
if (siteIndex !== -1 && (!args[siteIndex + 1] || args[siteIndex + 1].startsWith('--'))) {
    throw new Error('--site requires the path to the art website repository');
}
const destinations = [{ directory: path.join(root, 'web-deployment'), files: [...files, 'privacy.html', 'download.html'] }];
if (siteIndex !== -1) {
    const directory = path.resolve(args[siteIndex + 1], 'public/prompt-app');
    if (!(await stat(directory)).isDirectory()) throw new Error('The site app directory must already exist');
    destinations.push({ directory, files });
}
let mismatches = 0;
for (const destination of destinations) {
    let changed = 0;
    for (const file of destination.files) {
        const source = await readFile(path.join(root, file));
        const target = path.join(destination.directory, file);
        const current = await readFile(target).catch(error => {
            if (error.code !== 'ENOENT') throw error;
            return null;
        });
        if (current?.equals(source)) continue;
        mismatches++;
        changed++;
        if (check) console.error(`Out of sync: ${target}`);
        else {
            await mkdir(path.dirname(target), { recursive: true });
            await writeFile(target, source);
        }
    }
    console.log(`${destination.directory}: ${check ? 'checked' : 'synced'} ${destination.files.length} files; ${changed} ${check ? 'differences' : 'updated'}`);
}
if (check && mismatches) process.exitCode = 1;
