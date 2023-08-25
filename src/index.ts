// import fs from "fs";
// import path from "path";
const fs = require('fs');
const path = require('path');

interface BlockedUser {
	steamId: string;
	pilotName: string;
	steamName: string;
}

function loadBlocklist(path: string) {
	const file = fs.readFileSync(path, "utf-8");
	const lines = file.split("\n").map(l => l.trim());
	let depth = 0;
	let blocklist: BlockedUser[] = [];

	let pilotName = "";
	let steamName = "";
	let steamId = "";
	for (const line of lines) {
		if (line.startsWith("id")) steamId = line.split("= ")[1];
		if (line.startsWith("pilotName")) pilotName = line.split("= ")[1];
		if (line.startsWith("steamName")) steamName = line.split("= ")[1];
		if (line.startsWith("{")) depth++;
		if (line.startsWith("}")) {
			depth--;
			if (depth == 1) blocklist.push({ steamId, pilotName, steamName });
		}
	}

	return blocklist;
}

function writeBlocklist(path: string, blocklist: BlockedUser[]) {
	if (fs.existsSync(path)) fs.unlinkSync(path);

	let file = "NODE\n{\n";
	for (const user of blocklist) {
		file += "\tUSER\n\t{\n";
		file += `\t\tid = ${user.steamId}\n`;
		file += `\t\tsteamName = ${user.steamName}\n`;
		file += `\t\tpilotName = ${user.pilotName}\n`;
		file += "\t}\n";
	}
	file += "}";

	fs.writeFileSync(path, file);
}

async function run() {
	const hsBlockedUsersReq = await fetch("https://hs.vtolvr.live/api/v1/public/bannedusers");
	const hsBannedUsers = await hsBlockedUsersReq.json();
	const hsBlockedUsers: BlockedUser[] = hsBannedUsers.map((user: any) => {
		return {
			steamId: user.id,
			pilotName: user.pilotNames[0] ?? "Unknown",
			steamName: user.pilotNames[0] ?? "Unknown",
		};
	});
	// const hsBlockedUsers: BlockedUser[] = [{ steamId: "test-steam-id5", pilotName: "test", steamName: "test" }, { steamId: "test-steam-id6", pilotName: "test", steamName: "test" }, { steamId: "test-steam-id7", pilotName: "test", steamName: "test" }];

	console.log(`Got ${hsBlockedUsers.length} users from HS API`);


	const blPath = path.join(process.env.APPDATA, "Boundless Dynamics, LLC\\VTOLVR\\SaveData\\blocklist.cfg");
	let blFileBlockedUsers: BlockedUser[] = [];
	if (fs.existsSync(blPath)) blFileBlockedUsers = loadBlocklist(blPath);
	else console.log(`No current blocklist at ${blPath}`);

	console.log(`Got ${blFileBlockedUsers.length} users from blocklist file`);

	const whitelistPath = path.join(process.env.APPDATA, "Boundless Dynamics, LLC\\VTOLVR\\SaveData\\allowlist.txt");
	let whitelist: string[] = [];
	if (fs.existsSync(whitelistPath)) whitelist = fs.readFileSync(whitelistPath, "utf-8").split("\n");
	else console.log(`No current allowlist at ${whitelistPath}`);

	console.log(`Got ${whitelist.length} users from whitelist file`);

	const finalBlocklist = [...blFileBlockedUsers];
	for (const user of hsBlockedUsers) {
		if (whitelist.includes(user.steamId)) {
			console.log(`User ${user.steamId} is whitelisted, not blocking`);
			continue;
		}

		if (!finalBlocklist.some(bu => bu.steamId == user.steamId)) {
			finalBlocklist.push(user);
			console.log(`User ${user.pilotName} (${user.steamId}) is not blocked, adding to blocklist`);
		}
	}

	console.log(`Final blocklist has ${finalBlocklist.length} users`);

	writeBlocklist(blPath, finalBlocklist);
}

run();