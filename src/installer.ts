import { execSync } from "child_process";
import fs from "fs";

import * as VDF from "@node-steam/vdf";

import { run } from "./downloader.js";

const vtolId = "667970";

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
	execName = execPathParts[execPathParts.length - 1].split(".")[0];
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

function installForUser(steamPath: string, installLocation: string, userId: string) {
	const configPath = `${steamPath}/userdata/${userId}/config/localconfig.vdf`;
	console.log(`Installing for user ${userId} at ${configPath}`);
	if (!fs.existsSync(configPath)) {
		console.log(`Unable to locate config for user ${userId}`);
		return;
	}

	const config = fs.readFileSync(configPath, "utf-8");
	const parsed = VDF.parse(config) as any;


	// Get game
	const game = parsed.UserLocalConfigStore?.Software?.valve?.Steam?.apps?.[vtolId];
	if (!game) {
		console.log(`Unable to locate game for user ${userId}`);
		return;
	}

	const currentLaunchArgs: string = game.LaunchOptions || "";
	let userLaunchArgs = currentLaunchArgs;
	if (currentLaunchArgs.includes("%command%")) {
		const parts = currentLaunchArgs.split("%command%");
		userLaunchArgs = parts[1].trim();
		console.log(`Found existing launch args: ${currentLaunchArgs}, trying to extract ${userLaunchArgs}`);
	}

	const exePath = `\\"` + `${installLocation}\\blocklist-downloader.exe`.replaceAll("\\", "\\\\") + `\\"`;
	const newLaunchArgs = `${exePath} %command% ${userLaunchArgs}`;
	console.log(`Setting new launch args: ${newLaunchArgs}`);
	game.LaunchOptions = newLaunchArgs;

	const newConfig = VDF.stringify(parsed);
	fs.writeFileSync(configPath, newConfig);

	console.log(`Successfully installed for user ${userId}`);
}

function uninstallForUser(steamPath: string, userId: string) {
	const configPath = `${steamPath}/userdata/${userId}/config/localconfig.vdf`;
	console.log(`Uninstalling for user ${userId} at ${configPath}`);
	if (!fs.existsSync(configPath)) {
		console.log(`Unable to locate config for user ${userId}`);
		return;
	}

	const config = fs.readFileSync(configPath, "utf-8");
	const parsed = VDF.parse(config) as any;

	// Get game
	const game = parsed.UserLocalConfigStore?.Software?.valve?.Steam?.apps?.[vtolId];
	if (!game) {
		console.log(`Unable to locate game for user ${userId}`);
		return;
	}

	const currentLaunchArgs: string = game.LaunchOptions || "";
	if (!currentLaunchArgs.includes("%command%")) {
		console.log(`User ${userId} does not seem to have blocklist-downloader installed`);
		return;
	}
	const parts = currentLaunchArgs.split("%command%");
	const userLaunchArgs = parts[1].trim();

	console.log(`Setting new launch args: ${userLaunchArgs}`);
	game.LaunchOptions = userLaunchArgs;

	const newConfig = VDF.stringify(parsed);
	fs.writeFileSync(configPath, newConfig);

	console.log(`Successfully uninstalled for user ${userId}`);
}

function locateSteam() {
	const possiblePaths = ["C:\\Program Files (x86)\\Steam", "C:\\Program Files\\Steam", "C:\\Steam"];
	if (process.argv[3]) possiblePaths.unshift(process.argv[3]); // Allow passing in a custom path

	for (const path of possiblePaths) {
		if (fs.existsSync(path)) {
			console.log(`Found steam at ${path}`);
			return path;
		}
	}
}

function locateVtolPath(steamPath: string) {
	const libraryFoldersPath = `${steamPath}\\steamapps\\libraryfolders.vdf`;
	if (!fs.existsSync(libraryFoldersPath)) {
		console.log(`Unable to locate libraryfolders.vdf at ${libraryFoldersPath}`);
		return;
	}

	const libraryFolders = VDF.parse(fs.readFileSync(libraryFoldersPath, "utf-8")) as any;
	const folderKeys = Object.keys(libraryFolders.libraryfolders);
	for (const key of folderKeys) {
		const folder = libraryFolders.libraryfolders[key];
		const install = folder.apps[vtolId];
		console.log(`Checking if vtol is installed in ${folder.path} (${key}): ${install != undefined}`);

		if (install) {
			let vtolPath = `${folder.path}\\steamapps\\common\\VTOL VR`;
			vtolPath = vtolPath.replaceAll("\\\\", "\\");
			return vtolPath;
		}
	}

	console.log(`Unable to locate VTOLs install directory`);
}

function createInstallLocation(vtolPath: string): string {
	const installLocation = vtolPath + "\\blocklist-downloader";
	console.log(`Creating install location at ${vtolPath}`);
	if (!fs.existsSync(installLocation)) {
		console.log(`Creating folder at ${installLocation}`);
		fs.mkdirSync(installLocation);
	}

	const exePath = `${installLocation}/blocklist-downloader.exe`;
	if (fs.existsSync(exePath)) fs.rmSync(exePath);
	fs.copyFileSync(execPathParts.join("\\"), exePath);

	// Make the uninstall batch file
	const uninstallScript = `@echo off\nblocklist-downloader.exe uninstall\npause`;
	fs.writeFileSync(`${installLocation}/uninstall.bat`, uninstallScript);

	return installLocation;
}

async function install() {
	const steamPath = locateSteam();
	if (!steamPath) {
		console.log("Unable to locate steam");
		await keypress();
		process.exit(1);
	}

	const vtolPath = locateVtolPath(steamPath);
	if (!steamPath) {
		console.log("Unable to locate VTOLs install directory");
		await keypress();
		process.exit(1);
	}
	const installLocation = createInstallLocation(vtolPath);
	console.log({ steamPath, vtolPath, installLocation });
	const steamWasKilled = killSteam();

	const users = fs.readdirSync(`${steamPath}/userdata`);
	users.forEach(user => {
		try {
			installForUser(steamPath, installLocation, user);
		} catch (e) {
			console.log(`Installing for user ${user} failed: ${e}`);
			console.log(`${e.stack}`);
		}
	});

	if (steamWasKilled) {
		console.log("Restarting steam");
		execSync("start steam://open/main");
	}
}

async function uninstall() {
	const steamPath = locateSteam();
	if (!steamPath) {
		console.log("Unable to locate steam");
		await keypress();
		process.exit(1);
	}

	const steamWasKilled = killSteam();

	const users = fs.readdirSync(`${steamPath}/userdata`);
	users.forEach(user => {
		try {
			uninstallForUser(steamPath, user);
		} catch (e) {
			console.log(`Uninstalling for user ${user} failed: ${e}`);
			console.log(`${e.stack}`);
		}
	});

	if (steamWasKilled) {
		console.log("Restarting steam");
		execSync("start steam://open/main");
	}
}

const firstArg = process.argv[2]?.toLowerCase().trim();
if (firstArg == "uninstall" || firstArg == "remove") {
	console.log(`Running uninstaller`);
	uninstall();
	process.exit(0);
}

if (execName.toLowerCase().includes("installer")) {
	console.log(`Running as installer`);
	install();
} else {
	console.log(`Running as executable`);
	run();
}