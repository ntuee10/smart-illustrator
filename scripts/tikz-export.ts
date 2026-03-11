#!/usr/bin/env npx -y bun

/**
 * TikZ Diagram Export Script
 *
 * Wraps TikZ code into a standalone LaTeX document and optionally compiles
 * it to PDF or PNG. This enables LaTeX users to include generated illustrations
 * directly in their documents.
 *
 * Usage:
 *   npx -y bun ~/.claude/skills/smart-illustrator/scripts/tikz-export.ts --input diagram.tikz --output diagram.tex
 *   npx -y bun ~/.claude/skills/smart-illustrator/scripts/tikz-export.ts --content "\draw (0,0) -- (1,1);" --output diagram.tex
 *   npx -y bun ~/.claude/skills/smart-illustrator/scripts/tikz-export.ts --input diagram.tikz --output diagram.pdf --compile
 *   npx -y bun ~/.claude/skills/smart-illustrator/scripts/tikz-export.ts --input diagram.tikz --output diagram.png --compile --png
 *
 * Prerequisites for compilation:
 *   pdflatex or lualatex (from a LaTeX distribution such as TeX Live or MiKTeX)
 *   pdftoppm (from poppler-utils) or convert (from ImageMagick) for PNG output
 */

import { spawn } from 'node:child_process';
import { access, readFile, writeFile, mkdir, unlink, readdir } from 'node:fs/promises';
import { dirname, resolve, basename, join } from 'node:path';
import { tmpdir } from 'node:os';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ExportOptions {
  /** Raw TikZ code (the contents that go inside \begin{tikzpicture}...\end{tikzpicture}) */
  tikzCode: string;
  /** Output file path (.tex, .pdf, or .png) */
  output: string;
  /** Additional \usetikzlibrary entries (comma-separated) */
  libraries?: string;
  /** Additional \usepackage lines (comma-separated package names) */
  packages?: string;
  /** If true, attempt to compile the .tex file to PDF */
  compile?: boolean;
  /** If true (and --compile), further convert PDF to PNG */
  png?: boolean;
  /** Border size in pt for the standalone document (default: 10) */
  border?: number;
}

// ---------------------------------------------------------------------------
// LaTeX document template
// ---------------------------------------------------------------------------

/**
 * Builds a complete standalone LaTeX document containing the provided TikZ code.
 *
 * The document uses the `standalone` class so that the output PDF is cropped
 * tightly around the drawing — perfect for inclusion in other LaTeX files via
 * \includegraphics or \input.
 */
function buildLatexDocument(options: {
  tikzCode: string;
  libraries?: string;
  packages?: string;
  border?: number;
}): string {
  const border = options.border ?? 10;

  // Default TikZ libraries that cover the most common diagram patterns
  const defaultLibraries = [
    'shapes',
    'arrows.meta',
    'positioning',
    'calc',
    'fit',
    'backgrounds',
    'decorations.pathreplacing',
    'decorations.markings',
    'mindmap',
    'trees',
  ];

  // Merge default libraries with any user-supplied ones
  const extraLibraries = options.libraries
    ? options.libraries.split(',').map((l) => l.trim()).filter(Boolean)
    : [];
  const allLibraries = [...new Set([...defaultLibraries, ...extraLibraries])];
  const libraryLine = `\\usetikzlibrary{${allLibraries.join(',')}}`;

  // Extra packages requested by the caller
  const extraPackages = options.packages
    ? options.packages
        .split(',')
        .map((p) => p.trim())
        .filter(Boolean)
        .map((p) => `\\usepackage{${p}}`)
        .join('\n')
    : '';

  const tikzCode = options.tikzCode.trim();

  // Detect whether the code already contains \begin{tikzpicture}
  const hasBeginTikz = /\\begin\{tikzpicture\}/.test(tikzCode);

  const body = hasBeginTikz
    ? tikzCode
    : `\\begin{tikzpicture}\n${tikzCode}\n\\end{tikzpicture}`;

  return `\\documentclass[tikz,border=${border}pt]{standalone}
\\usepackage{tikz}
\\usepackage{pgfplots}
\\pgfplotsset{compat=1.18}
\\usepackage{xcolor}
\\usepackage{amsmath}
${extraPackages}
${libraryLine}

\\begin{document}
${body}
\\end{document}
`;
}

// ---------------------------------------------------------------------------
// Helper: run a child process and collect output
// ---------------------------------------------------------------------------

function runProcess(
  command: string,
  args: string[],
  cwd?: string
): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';

    const proc = spawn(command, args, { cwd, stdio: 'pipe' });

    proc.stdout?.on('data', (d: Buffer) => { stdout += d.toString(); });
    proc.stderr?.on('data', (d: Buffer) => { stderr += d.toString(); });

    proc.on('close', (code) => resolve({ code: code ?? 1, stdout, stderr }));
    proc.on('error', (err) => resolve({ code: 1, stdout, stderr: err.message }));
  });
}

// ---------------------------------------------------------------------------
// Capability checks
// ---------------------------------------------------------------------------

async function checkCommand(cmd: string): Promise<boolean> {
  const result = await runProcess(cmd, ['--version']);
  return result.code === 0;
}

async function findLatexCompiler(): Promise<string | null> {
  for (const compiler of ['lualatex', 'pdflatex']) {
    if (await checkCommand(compiler)) {
      return compiler;
    }
  }
  return null;
}

async function findPdfToPng(): Promise<'pdftoppm' | 'convert' | null> {
  if (await checkCommand('pdftoppm')) return 'pdftoppm';
  if (await checkCommand('convert')) return 'convert';
  return null;
}

// ---------------------------------------------------------------------------
// Compilation
// ---------------------------------------------------------------------------

/**
 * Compiles a .tex file to PDF in a temporary directory and copies the result
 * to `outputPdf`.
 */
async function compileToPdf(texFile: string, outputPdf: string): Promise<void> {
  const compiler = await findLatexCompiler();
  if (!compiler) {
    throw new Error(
      'No LaTeX compiler found. Please install TeX Live or MiKTeX.\n' +
      '  Ubuntu/Debian: sudo apt-get install texlive-latex-extra\n' +
      '  macOS:         brew install --cask mactex\n' +
      '  Windows:       https://miktex.org/'
    );
  }

  const tempDir = resolve(tmpdir(), `tikz-compile-${Date.now()}`);
  await mkdir(tempDir, { recursive: true });

  const texContent = await readFile(texFile, 'utf-8');
  const tempTex = join(tempDir, 'diagram.tex');
  await writeFile(tempTex, texContent, 'utf-8');

  console.log(`Compiling with ${compiler}...`);

  // Run twice to resolve cross-references (standard LaTeX practice)
  for (let pass = 1; pass <= 2; pass++) {
    const result = await runProcess(
      compiler,
      ['-interaction=nonstopmode', '-halt-on-error', 'diagram.tex'],
      tempDir
    );

    if (result.code !== 0) {
      const logFile = join(tempDir, 'diagram.log');
      let logContent = '';
      try {
        logContent = await readFile(logFile, 'utf-8');
      } catch {
        logContent = result.stdout + result.stderr;
      }
      throw new Error(`LaTeX compilation failed (pass ${pass}):\n${logContent.slice(-2000)}`);
    }
  }

  const tempPdf = join(tempDir, 'diagram.pdf');
  const pdfBuffer = await readFile(tempPdf);
  await writeFile(outputPdf, pdfBuffer);

  // Clean up temp directory
  try {
    const files = await readdir(tempDir);
    await Promise.all(files.map((f) => unlink(join(tempDir, f)).catch(() => {})));
  } catch {
    // Ignore cleanup errors
  }
}

/**
 * Converts a PDF file to PNG using pdftoppm (preferred) or ImageMagick convert.
 */
async function convertPdfToPng(pdfFile: string, outputPng: string): Promise<void> {
  const tool = await findPdfToPng();

  if (!tool) {
    throw new Error(
      'No PDF-to-PNG converter found.\n' +
      '  Ubuntu/Debian: sudo apt-get install poppler-utils\n' +
      '  macOS:         brew install poppler\n' +
      '  Or install ImageMagick: https://imagemagick.org/'
    );
  }

  if (tool === 'pdftoppm') {
    // pdftoppm outputs <prefix>-1.png (for single-page docs)
    const prefix = outputPng.replace(/\.png$/i, '');
    const result = await runProcess('pdftoppm', ['-png', '-r', '300', pdfFile, prefix]);
    if (result.code !== 0) {
      throw new Error(`pdftoppm failed: ${result.stderr}`);
    }
    // Rename the generated file (pdftoppm appends "-1" for page 1)
    const generated = `${prefix}-1.png`;
    try {
      await access(generated);
      // If the caller wanted exactly outputPng and the names differ, rename
      if (generated !== outputPng) {
        const buf = await readFile(generated);
        await writeFile(outputPng, buf);
        await unlink(generated);
      }
    } catch {
      // Some versions output without the page suffix for single-page docs
    }
  } else {
    // ImageMagick convert
    const result = await runProcess('convert', [
      '-density', '300',
      '-quality', '95',
      pdfFile,
      outputPng,
    ]);
    if (result.code !== 0) {
      throw new Error(`ImageMagick convert failed: ${result.stderr}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Main export function
// ---------------------------------------------------------------------------

async function exportTikz(options: ExportOptions): Promise<void> {
  const { tikzCode, output, libraries, packages, compile, png, border } = options;

  const latexDoc = buildLatexDocument({ tikzCode, libraries, packages, border });

  // Always write the .tex file first
  const texOutput = output.replace(/\.(pdf|png)$/i, '.tex');
  await mkdir(dirname(texOutput), { recursive: true });
  await writeFile(texOutput, latexDoc, 'utf-8');
  console.log(`TikZ LaTeX file written to: ${texOutput}`);

  if (!compile) {
    return;
  }

  // Compile to PDF
  const pdfOutput = output.replace(/\.(tex|png)$/i, '.pdf');
  await mkdir(dirname(pdfOutput), { recursive: true });

  await compileToPdf(texOutput, pdfOutput);
  console.log(`PDF compiled to: ${pdfOutput}`);

  if (!png) {
    return;
  }

  // Convert PDF → PNG
  const pngOutput = output.replace(/\.(tex|pdf)$/i, '.png');
  await mkdir(dirname(pngOutput), { recursive: true });

  await convertPdfToPng(pdfOutput, pngOutput);
  console.log(`PNG exported to: ${pngOutput}`);
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function printUsage(): never {
  console.log(`
TikZ Diagram Export Script

Usage:
  npx -y bun tikz-export.ts --input diagram.tikz --output diagram.tex
  npx -y bun tikz-export.ts --content "\\draw (0,0) circle (1);" --output diagram.tex
  npx -y bun tikz-export.ts --input diagram.tikz --output diagram.pdf --compile
  npx -y bun tikz-export.ts --input diagram.tikz --output diagram.png --compile --png

Options:
  -i, --input <path>        Input file containing TikZ code (.tikz or .tex)
  -c, --content <text>      Inline TikZ code (alternative to --input)
  -o, --output <path>       Output path (.tex, .pdf, or .png) (default: output.tex)
  -l, --libraries <list>    Additional \\usetikzlibrary entries (comma-separated)
  -p, --packages <list>     Additional \\usepackage entries (comma-separated)
  --border <pt>             Standalone document border in pt (default: 10)
  --compile                 Compile .tex to PDF using pdflatex or lualatex
  --png                     Also convert compiled PDF to PNG (requires --compile)
  -h, --help                Show this help

Input format:
  The input should contain TikZ drawing commands. You may provide either:
  - Raw TikZ commands (the script wraps them in \\begin{tikzpicture}...\\end{tikzpicture})
  - A full \\begin{tikzpicture}...\\end{tikzpicture} block

Output formats:
  .tex   Standalone LaTeX file ready for \\input{} or \\includegraphics{}
  .pdf   Compiled PDF (requires --compile and a LaTeX installation)
  .png   Raster image at 300 dpi (requires --compile --png and poppler-utils or ImageMagick)

Prerequisites for compilation:
  LaTeX:  sudo apt-get install texlive-latex-extra   # Ubuntu/Debian
          brew install --cask mactex                 # macOS
  PNG:    sudo apt-get install poppler-utils          # Ubuntu/Debian (pdftoppm)
          brew install poppler                       # macOS

Examples:
  # Export TikZ code to a LaTeX file
  npx -y bun tikz-export.ts -i flowchart.tikz -o flowchart.tex

  # Compile to PDF
  npx -y bun tikz-export.ts -i flowchart.tikz -o flowchart.pdf --compile

  # Compile to PNG for direct embedding in non-LaTeX contexts
  npx -y bun tikz-export.ts -i flowchart.tikz -o flowchart.png --compile --png

  # Inline code example
  npx -y bun tikz-export.ts -c "\\draw[->] (0,0) -- (2,0) node[right] {x};" -o axis.tex

  # Add extra TikZ libraries
  npx -y bun tikz-export.ts -i circuit.tikz -o circuit.tex -l "circuits.ee.IEC,intersections"
`);
  process.exit(0);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  let input: string | null = null;
  let content: string | null = null;
  let output = 'output.tex';
  let libraries: string | undefined;
  let packages: string | undefined;
  let compile = false;
  let png = false;
  let border: number | undefined;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    switch (arg) {
      case '-h':
      case '--help':
        printUsage();
        break;
      case '-i':
      case '--input':
        if (i + 1 >= args.length) { console.error(`Error: ${arg} requires a value`); process.exit(1); }
        input = args[++i];
        break;
      case '-c':
      case '--content':
        if (i + 1 >= args.length) { console.error(`Error: ${arg} requires a value`); process.exit(1); }
        content = args[++i];
        break;
      case '-o':
      case '--output':
        if (i + 1 >= args.length) { console.error(`Error: ${arg} requires a value`); process.exit(1); }
        output = args[++i];
        break;
      case '-l':
      case '--libraries':
        if (i + 1 >= args.length) { console.error(`Error: ${arg} requires a value`); process.exit(1); }
        libraries = args[++i];
        break;
      case '-p':
      case '--packages':
        if (i + 1 >= args.length) { console.error(`Error: ${arg} requires a value`); process.exit(1); }
        packages = args[++i];
        break;
      case '--border': {
        if (i + 1 >= args.length) { console.error('Error: --border requires a value'); process.exit(1); }
        const parsed = parseInt(args[++i], 10);
        if (isNaN(parsed) || parsed < 0) {
          console.error('Error: --border must be a non-negative integer (in pt)');
          process.exit(1);
        }
        border = parsed;
        break;
      }
      case '--compile':
        compile = true;
        break;
      case '--png':
        png = true;
        break;
    }
  }

  // Validate
  if (!input && !content) {
    console.error('Error: --input or --content is required');
    console.error('Run with --help for usage information.');
    process.exit(1);
  }

  if (png && !compile) {
    console.error('Error: --png requires --compile');
    process.exit(1);
  }

  // Read TikZ code
  let tikzCode: string;
  if (input) {
    try {
      await access(input);
    } catch {
      console.error(`Error: Input file not found: ${input}`);
      process.exit(1);
    }
    tikzCode = await readFile(input, 'utf-8');
  } else {
    tikzCode = content!;
  }

  // Ensure output directory exists
  await mkdir(dirname(resolve(output)), { recursive: true });

  console.log('Generating TikZ LaTeX document...');

  try {
    await exportTikz({ tikzCode, output, libraries, packages, compile, png, border });
  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

main();
