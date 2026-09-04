import fs from "node:fs";

const app = fs.readFileSync(new URL("../app.js", import.meta.url), "utf8");
const html = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");

const match = app.match(/function shouldPromptForName\(profile\)\s*\{([\s\S]*?)\n\}/);
if (!match) throw new Error("shouldPromptForName helper is missing");
const pristineState = { courses: [], todos: [], logs: {}, habits: [], profile: {} };
const shouldPromptForName = Function("profile", "state", match[1]);

if (!shouldPromptForName({ name: "Hzx" }, pristineState)) {
  throw new Error("A profile that has not answered the welcome prompt must be prompted");
}
if (shouldPromptForName({ name: "何子轩", namePrompted: true }, pristineState)) {
  throw new Error("A profile that already answered the welcome prompt must not be prompted again");
}
const existingUserState = {
  courses: [{ id: "course-1" }],
  todos: [],
  logs: { "2026-09-04": { entries: [] } },
  habits: [{ id: "habit-1" }],
  profile: {},
};
if (!shouldPromptForName({ name: "Hzx", namePrompted: false }, existingUserState)) {
  throw new Error("An unanswered name prompt must still be shown when the user already has data");
}

const migrationMatch = app.match(/function migrateDefaultSemesterStart\(profile\)\s*\{([\s\S]*?)\n\}/);
if (!migrationMatch) throw new Error("Semester start migration helper is missing");
const migrateDefaultSemesterStart = Function("profile", "LEGACY_DEFAULT_SEMESTER_START", "CURRENT_SEMESTER_START", migrationMatch[1]);
if (migrateDefaultSemesterStart({ semesterStart: "2026-08-24" }, "2026-08-24", "2026-08-31").semesterStart !== "2026-08-31") {
  throw new Error("The old default semester start must migrate to 2026-08-31");
}
if (migrateDefaultSemesterStart({ semesterStart: "2026-09-07" }, "2026-08-24", "2026-08-31").semesterStart !== "2026-09-07") {
  throw new Error("A user-selected semester start must not be overwritten");
}

const welcomeMigrationMatch = app.match(/function migrateWelcomePrompt\(profile\)\s*\{([\s\S]*?)\n\}/);
if (!welcomeMigrationMatch) throw new Error("Welcome prompt migration helper is missing");
const migrateWelcomePrompt = Function("profile", welcomeMigrationMatch[1]);
if (migrateWelcomePrompt({ name: "Hzx", namePrompted: true }).namePrompted) {
  throw new Error("The old auto-suppressed seed profile must be prompted once after upgrading");
}
if (!migrateWelcomePrompt({ name: "小何", namePrompted: true }).namePrompted) {
  throw new Error("A name prompt that the user actually answered must remain dismissed");
}
if (!html.includes('id="welcome-modal"')) throw new Error("Welcome name modal is missing");
if (!html.includes('id="welcome-name"')) throw new Error("Welcome name input is missing");
if (!html.includes('data-action="save-welcome-name"')) throw new Error("Welcome name save action is missing");

console.log("welcome profile tests passed");
