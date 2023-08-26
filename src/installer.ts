import { execSync } from "child_process";
import fs from "fs";
import VDF from "vdf-parser";

import { run } from "./downloader.js";

const installToPath = process.argv[2] ?? "C:/BlocklistDownloader";

const orgLog = console.log;
console.log = (...args: any[]) => {
	orgLog(...args);
	fs.appendFileSync("./blocklist.log", args.join(" ") + "\n");
};
console.log(new Date().toISOString());
console.log(`Exec options: ${process.argv.join(" ")}`);

let execPathParts = process.argv[0].split("\\");
let execName = execPathParts[execPathParts.length - 1].split(".")[0];
if (execName == "node") {
	execPathParts = process.argv[1].split("\\");
	execPathParts[execPathParts.length - 1].split(".")[0];
}


const keypress = async () => {
	process.stdin.setRawMode(true);
	return new Promise<void>(resolve => process.stdin.once('data', () => {
		process.stdin.setRawMode(false);
		resolve();
	}));
};

function killSteam() {
	console.log("Killing steam");
	try {
		const result = execSync("taskkill /f /IM \"steam.exe\"");
		console.log(`Steam was killed`);
		return true;
	} catch (e) {
		console.log("Unable to kill steam");
		return false;
	}
}

function installForUser(steamPath: string, userId: string) {
	const configPath = `${steamPath}/userdata/${userId}/config/localconfig.vdf`;
	if (!fs.existsSync(configPath)) {
		console.log(`Unable to locate config for user ${userId}`);
		return;
	}

	const config = fs.readFileSync(configPath, "utf-8");
	const parsed = VDF.parse(config) as any;


	// Get game
	const game = parsed.UserLocalConfigStore?.Software?.valve?.Steam?.apps?.["667970"];
	if (!game) {
		console.log(`Unable to locate game for user ${userId}`);
		return;
	}

	const currentLaunchArgs: string = game.LaunchOptions || "";
	let userLaunchArgs = "";
	if (currentLaunchArgs.includes("%command%")) {
		const parts = currentLaunchArgs.split("%command%");
		userLaunchArgs = parts[1].trim();
		console.log(`Found existing launch args: ${currentLaunchArgs}, trying to extract ${userLaunchArgs}`);
	}

	const newLaunchArgs = `${installToPath}/blocklist-downloader.exe %command% ${userLaunchArgs}`;
	console.log(`Setting new launch args: ${newLaunchArgs}`);
	game.LaunchOptions = newLaunchArgs;

	const newConfig = VDF.stringify(parsed, { pretty: true, indent: "\t" });
	fs.writeFileSync(configPath, newConfig);

	console.log(`Successfully installed for user ${userId}`);
}

function locateSteam() {
	const possiblePaths = ["C:/Program Files (x86)/Steam", "C:/Program Files/Steam", "C:/Steam"];
	if (process.argv[3]) possiblePaths.unshift(process.argv[3]); // Allow passing in a custom path

	for (const path of possiblePaths) {
		if (fs.existsSync(path)) {
			console.log(`Found steam at ${path}`);
			return path;
		}
	}
}

function createInstallLocation() {
	console.log(`Creating install location at ${installToPath}`);
	if (!fs.existsSync(installToPath)) {
		console.log(`Creating folder at ${installToPath}`);
		fs.mkdirSync(installToPath);
	}

	const exePath = `${installToPath}/blocklist-downloader.exe`;
	if (fs.existsSync(exePath)) fs.rmSync(exePath);
	fs.copyFileSync(execPathParts.join("\\"), exePath);
}

async function install() {
	const steamPath = locateSteam();
	if (!steamPath) {
		console.log("Unable to locate steam");
		await keypress();
		process.exit(1);
	}

	const steamWasKilled = killSteam();

	createInstallLocation();

	const users = fs.readdirSync(`${steamPath}/userdata`);
	users.forEach(user => installForUser(steamPath, user));

	if (steamWasKilled) {
		console.log("Restarting steam");
		execSync("start steam://open/main");
	}
}


if (execName.toLowerCase().includes("installer")) {
	console.log(`Running as installer`);
	install();
} else {
	console.log(`Running as executable`);
	run();
}