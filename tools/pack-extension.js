#!/usr/bin/env node
/**
 * Pack Chrome Extension Script
 *
 * Creates a zip file containing only the files needed for the Chrome extension.
 * Based on manifest.json dependencies and Chrome extension requirements.
 */

import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

// Files required for Chrome extension (based on manifest.json)
const EXTENSION_FILES = [
	// Core extension files
	"manifest.json",
	"main_background.js",
	"content.js",
	"injected.js",

	// Web accessible resources
	"readability.js",
	"turndown.js",

	// Popup interface
	"popup.html",
	"popup.js",

	// Icons directory (all files)
	"icons/",

	// BROP and CDP protocol handlers (referenced by main_background.js)
	"brop_server.js",
	"cdp_server.js",
];

// Additional files that might be referenced by the extension
const OPTIONAL_FILES = [
	"README.md", // Optional documentation
];

function checkFileExists(filePath) {
	try {
		return fs.existsSync(filePath);
	} catch (error) {
		return false;
	}
}

function getTimestamp() {
	const now = new Date();
	return now.toISOString().slice(0, 19).replace(/[:.]/g, "-");
}

function createExtensionZip(useTimestamp = true) {
	console.log("🏗️  BROP Chrome Extension Packager");
	console.log(`=${"=".repeat(50)}`);

	const projectRoot = process.cwd();
	const timestamp = getTimestamp();
	const zipFileName = useTimestamp
		? `brop-extension-${timestamp}.zip`
		: "brop-extension.zip";
	const tempDir = `temp-extension-${timestamp}`;

	console.log(`📁 Project root: ${projectRoot}`);
	console.log(`📦 Creating: ${zipFileName}`);
	console.log("");

	try {
		// Create temporary directory
		if (fs.existsSync(tempDir)) {
			execSync(`rm -rf ${tempDir}`);
		}
		fs.mkdirSync(tempDir);
		console.log(`📂 Created temp directory: ${tempDir}`);

		// Copy essential files
		let copiedFiles = 0;
		let skippedFiles = 0;

		console.log("\n📋 Copying extension files:");

		for (const file of EXTENSION_FILES) {
			const sourcePath = path.join(projectRoot, file);
			const destPath = path.join(tempDir, file);

			if (file.endsWith("/")) {
				// Handle directories
				const dirName = file.slice(0, -1);
				if (fs.existsSync(sourcePath.slice(0, -1))) {
					console.log(`   📁 ${dirName}/`);
					execSync(`cp -r "${sourcePath.slice(0, -1)}" "${tempDir}/"`);
					copiedFiles++;
				} else {
					console.log(`   ❌ ${dirName}/ (not found)`);
					skippedFiles++;
				}
			} else {
				// Handle files
				if (checkFileExists(sourcePath)) {
					console.log(`   ✅ ${file}`);

					// Create directory if needed
					const destDir = path.dirname(destPath);
					if (!fs.existsSync(destDir)) {
						fs.mkdirSync(destDir, { recursive: true });
					}

					fs.copyFileSync(sourcePath, destPath);
					copiedFiles++;
				} else {
					console.log(`   ❌ ${file} (not found)`);
					skippedFiles++;
				}
			}
		}

		// Check for optional files
		console.log("\n📋 Checking optional files:");
		for (const file of OPTIONAL_FILES) {
			const sourcePath = path.join(projectRoot, file);
			const destPath = path.join(tempDir, file);

			if (checkFileExists(sourcePath)) {
				console.log(`   ➕ ${file} (found, including)`);
				fs.copyFileSync(sourcePath, destPath);
				copiedFiles++;
			} else {
				console.log(`   ➖ ${file} (not found, skipping)`);
			}
		}

		// Validate manifest.json
		console.log("\n🔍 Validating extension structure:");
		const manifestPath = path.join(tempDir, "manifest.json");
		if (fs.existsSync(manifestPath)) {
			try {
				const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
				console.log(
					`   ✅ Manifest valid - ${manifest.name} v${manifest.version}`,
				);
				console.log(`   📋 Manifest version: ${manifest.manifest_version}`);

				// Check if background script exists
				if (manifest.background?.service_worker) {
					const bgScript = path.join(
						tempDir,
						manifest.background.service_worker,
					);
					if (fs.existsSync(bgScript)) {
						console.log(
							`   ✅ Background script: ${manifest.background.service_worker}`,
						);
					} else {
						console.log(
							`   ⚠️  Background script missing: ${manifest.background.service_worker}`,
						);
					}
				}

				// Check content scripts
				if (manifest.content_scripts) {
					for (const cs of manifest.content_scripts) {
						for (const jsFile of cs.js) {
							const scriptPath = path.join(tempDir, jsFile);
							if (fs.existsSync(scriptPath)) {
								console.log(`   ✅ Content script: ${jsFile}`);
							} else {
								console.log(`   ⚠️  Content script missing: ${jsFile}`);
							}
						}
					}
				}
			} catch (error) {
				console.log(`   ❌ Manifest validation failed: ${error.message}`);
			}
		} else {
			console.log("   ❌ manifest.json missing!");
		}

		// Create zip file
		console.log("\n📦 Creating zip archive:");
		const zipCommand = `cd "${tempDir}" && zip -r "../${zipFileName}" . -x "*.DS_Store" "*/__pycache__/*"`;
		execSync(zipCommand);

		// Get zip file size
		const zipStats = fs.statSync(zipFileName);
		const sizeKB = Math.round(zipStats.size / 1024);

		console.log(`   ✅ Created: ${zipFileName} (${sizeKB} KB)`);

		// Clean up temp directory
		execSync(`rm -rf "${tempDir}"`);
		console.log(`   🧹 Cleaned up: ${tempDir}`);

		// Final summary
		console.log("\n🎉 Extension packaging complete!");
		console.log(`📦 Package: ${zipFileName}`);
		console.log(`📊 Files included: ${copiedFiles}`);
		console.log(`📊 Files skipped: ${skippedFiles}`);
		console.log(`💾 Package size: ${sizeKB} KB`);

		console.log("\n🚀 Installation instructions:");
		console.log("1. Open Chrome and go to chrome://extensions/");
		console.log('2. Enable "Developer mode" in the top right');
		console.log('3. Click "Load unpacked" and select the extracted folder');
		console.log(`4. Or drag and drop ${zipFileName} to install directly`);
	} catch (error) {
		console.error("💥 Error creating extension package:", error.message);

		// Clean up on error
		if (fs.existsSync(tempDir)) {
			execSync(`rm -rf "${tempDir}"`);
			console.log("🧹 Cleaned up temp directory after error");
		}

		process.exit(1);
	}
}

// Show help
function showHelp() {
	console.log("BROP Chrome Extension Packager");
	console.log("");
	console.log("Usage:");
	console.log("  node pack-extension.js [--no-timestamp]");
	console.log("  pnpm run pack:extension");
	console.log("");
	console.log("Options:");
	console.log(
		"  --no-timestamp    Create brop-extension.zip without timestamp",
	);
	console.log("");
	console.log(
		"This script packages the Chrome extension files into a zip archive",
	);
	console.log("suitable for distribution or Chrome Web Store upload.");
}

// Main execution
if (import.meta.url === `file://${process.argv[1]}`) {
	const args = process.argv.slice(2);

	if (args.includes("--help") || args.includes("-h")) {
		showHelp();
		process.exit(0);
	}

	// Check if we're in the right directory
	if (!fs.existsSync("manifest.json")) {
		console.error("❌ Error: manifest.json not found in current directory");
		console.error("Please run this script from the project root directory");
		process.exit(1);
	}

	const useTimestamp = !args.includes("--no-timestamp");
	createExtensionZip(useTimestamp);
}

export { createExtensionZip };
