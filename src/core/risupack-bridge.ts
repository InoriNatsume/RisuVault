import { runExtractCommand, runBuildCommand } from "../risupack/src/app/commands.js";

export async function extractWith(inputPath: string, projectDir: string) {
  return runExtractCommand(inputPath, projectDir);
}

export async function buildWith(projectDir: string, outputPath?: string) {
  return runBuildCommand(projectDir, outputPath);
}
