#!/usr/bin/env node
/**
 * Test Runner for Element Detection Framework
 * 
 * Runs comprehensive tests for the 14-layer element detection system
 * and generates a detailed test report.
 */

import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

class TestRunner {
	constructor() {
		this.results = [];
		this.startTime = Date.now();
	}

	async runTest(testFile, testName) {
		console.log(`\n${"=".repeat(70)}`);
		console.log(`🚀 Running: ${testName}`);
		console.log(`${"=".repeat(70)}`);

		const startTime = Date.now();
		
		return new Promise((resolve) => {
			const testProcess = spawn("node", [join(__dirname, testFile)], {
				stdio: "inherit"
			});

			testProcess.on("close", (code) => {
				const duration = Date.now() - startTime;
				const result = {
					name: testName,
					file: testFile,
					success: code === 0,
					duration: duration,
					exitCode: code
				};
				
				this.results.push(result);
				console.log(`\n${result.success ? "✅" : "❌"} ${testName} completed in ${duration}ms`);
				resolve(result);
			});

			testProcess.on("error", (error) => {
				const duration = Date.now() - startTime;
				const result = {
					name: testName,
					file: testFile,
					success: false,
					duration: duration,
					error: error.message
				};
				
				this.results.push(result);
				console.log(`\n❌ ${testName} failed: ${error.message}`);
				resolve(result);
			});
		});
	}

	generateReport() {
		const totalDuration = Date.now() - this.startTime;
		const passedTests = this.results.filter(r => r.success);
		const failedTests = this.results.filter(r => !r.success);

		console.log(`\n${"=".repeat(70)}`);
		console.log("📊 ELEMENT DETECTION FRAMEWORK TEST REPORT");
		console.log(`${"=".repeat(70)}`);
		
		console.log(`\n📈 SUMMARY:`);
		console.log(`   Total Tests: ${this.results.length}`);
		console.log(`   Passed: ${passedTests.length} ✅`);
		console.log(`   Failed: ${failedTests.length} ${failedTests.length > 0 ? "❌" : ""}`);
		console.log(`   Success Rate: ${((passedTests.length / this.results.length) * 100).toFixed(1)}%`);
		console.log(`   Total Duration: ${totalDuration}ms (${(totalDuration / 1000).toFixed(1)}s)`);

		if (this.results.length > 0) {
			console.log(`\n📋 DETAILED RESULTS:`);
			this.results.forEach((result, index) => {
				const status = result.success ? "✅ PASS" : "❌ FAIL";
				const duration = `${result.duration}ms`;
				console.log(`   ${index + 1}. ${status} ${result.name.padEnd(35)} ${duration.padStart(8)}`);
				if (result.error) {
					console.log(`      Error: ${result.error}`);
				}
			});
		}

		if (failedTests.length > 0) {
			console.log(`\n⚠️  FAILED TESTS:`);
			failedTests.forEach((result) => {
				console.log(`   - ${result.name} (${result.file})`);
				if (result.error) {
					console.log(`     Error: ${result.error}`);
				} else if (result.exitCode !== 0) {
					console.log(`     Exit code: ${result.exitCode}`);
				}
			});
		}

		if (passedTests.length === this.results.length) {
			console.log(`\n🎉 ALL TESTS PASSED! Element Detection Framework is working correctly.`);
		} else if (passedTests.length > 0) {
			console.log(`\n⚠️  PARTIAL SUCCESS: ${passedTests.length}/${this.results.length} tests passed.`);
			console.log(`   The framework is partially functional but needs attention.`);
		} else {
			console.log(`\n💥 ALL TESTS FAILED! Element Detection Framework needs immediate attention.`);
		}

		// Performance analysis
		if (passedTests.length > 0) {
			const avgDuration = passedTests.reduce((sum, r) => sum + r.duration, 0) / passedTests.length;
			const slowestTest = passedTests.reduce((prev, current) => 
				(prev.duration > current.duration) ? prev : current
			);
			const fastestTest = passedTests.reduce((prev, current) => 
				(prev.duration < current.duration) ? prev : current
			);

			console.log(`\n⚡ PERFORMANCE ANALYSIS:`);
			console.log(`   Average test duration: ${Math.round(avgDuration)}ms`);
			console.log(`   Fastest test: ${fastestTest.name} (${fastestTest.duration}ms)`);
			console.log(`   Slowest test: ${slowestTest.name} (${slowestTest.duration}ms)`);
		}

		console.log(`\n${"=".repeat(70)}`);
		
		return {
			totalTests: this.results.length,
			passed: passedTests.length,
			failed: failedTests.length,
			successRate: (passedTests.length / this.results.length) * 100,
			totalDuration: totalDuration,
			results: this.results
		};
	}
}

async function checkServerConnection() {
	console.log("🔍 Checking BROP server connection...");
	
	try {
		// Try to connect to the server
		const WebSocket = (await import("ws")).default;
		const ws = new WebSocket("ws://localhost:9225?name=test_runner_check");
		
		return new Promise((resolve, reject) => {
			const timeout = setTimeout(() => {
				ws.close();
				reject(new Error("Connection timeout"));
			}, 5000);

			ws.on("open", () => {
				clearTimeout(timeout);
				ws.close();
				console.log("✅ BROP server is running and accessible");
				resolve(true);
			});

			ws.on("error", (error) => {
				clearTimeout(timeout);
				reject(error);
			});
		});
	} catch (error) {
		throw new Error(`Cannot connect to BROP server: ${error.message}`);
	}
}

async function main() {
	console.log("🧪 Element Detection Framework Test Suite");
	console.log(`Started at: ${new Date().toISOString()}`);
	
	try {
		// Check server connection first
		await checkServerConnection();
		
		const runner = new TestRunner();

		// Run the test suite
		const tests = [
			{
				file: "test-element-detection-framework.js",
				name: "Element Detection Framework - Core Tests"
			},
			{
				file: "test-element-detection-edge-cases.js", 
				name: "Element Detection Framework - Edge Cases"
			}
		];

		console.log(`\n🎯 Running ${tests.length} test suites for Element Detection Framework...`);

		for (const test of tests) {
			await runner.runTest(test.file, test.name);
		}

		// Generate final report
		const report = runner.generateReport();
		
		// Exit with appropriate code
		process.exit(report.failed > 0 ? 1 : 0);

	} catch (error) {
		console.error(`\n❌ Test runner failed: ${error.message}`);
		console.error("\n💡 Make sure:");
		console.error("   1. BROP bridge server is running (npm run bridge)");
		console.error("   2. Chrome extension is loaded and connected");
		console.error("   3. WebSocket server is accessible on port 9225");
		process.exit(1);
	}
}

// Handle process signals
process.on("SIGINT", () => {
	console.log("\n\n⚠️  Test runner interrupted by user");
	process.exit(130);
});

process.on("SIGTERM", () => {
	console.log("\n\n⚠️  Test runner terminated");
	process.exit(143);
});

// Run the test suite
main();