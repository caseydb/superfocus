"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
var client_1 = require("@prisma/client");
var fs_1 = require("fs");
var path_1 = require("path");
var prisma = new client_1.PrismaClient();
// Function to parse duration string (mm:ss or hh:mm:ss) to seconds
function parseDurationToSeconds(durationStr) {
    var parts = durationStr.split(':').map(Number);
    if (parts.length === 2) {
        // mm:ss format
        var minutes = parts[0], seconds = parts[1];
        return minutes * 60 + seconds;
    }
    else if (parts.length === 3) {
        // hh:mm:ss format
        var hours = parts[0], minutes = parts[1], seconds = parts[2];
        return hours * 3600 + minutes * 60 + seconds;
    }
    return 0;
}
// Function to convert timestamp to Pacific/Auckland timezone
function convertToAucklandTime(timestamp) {
    // Create a date from the timestamp
    var date = new Date(timestamp);
    // Format to Auckland timezone
    var formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: 'Pacific/Auckland',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        fractionalSecondDigits: 3,
        hour12: false
    });
    var parts = formatter.formatToParts(date);
    var dateParts = {};
    parts.forEach(function (part) {
        if (part.type !== 'literal') {
            dateParts[part.type] = part.value;
        }
    });
    // Construct ISO string in Auckland time
    var isoString = "".concat(dateParts.year, "-").concat(dateParts.month, "-").concat(dateParts.day, "T").concat(dateParts.hour, ":").concat(dateParts.minute, ":").concat(dateParts.second, ".").concat(dateParts.fractionalSecond || '000', "Z");
    return new Date(isoString);
}
function importTestData() {
    return __awaiter(this, void 0, void 0, function () {
        var testDataPath, testData, userId, roomId, userExists, users, roomExists, completedTasksImported, notStartedTasksImported, _i, _a, _b, firebaseUserId, userData, _c, _d, _e, historyId, entry, durationSeconds, completedAt, error_1, nowAuckland, _f, _g, _h, taskId, task, error_2, error_3;
        return __generator(this, function (_j) {
            switch (_j.label) {
                case 0:
                    _j.trys.push([0, 19, 20, 22]);
                    testDataPath = path_1.default.join(__dirname, 'test.json');
                    testData = JSON.parse(fs_1.default.readFileSync(testDataPath, 'utf8'));
                    userId = testData["task table ids"].user_id;
                    roomId = testData["task table ids"].room_id;
                    return [4 /*yield*/, prisma.user.findUnique({
                            where: { id: userId }
                        })];
                case 1:
                    userExists = _j.sent();
                    if (!!userExists) return [3 /*break*/, 3];
                    console.error("\n\u274C ERROR: User with id ".concat(userId, " does not exist in the database!"));
                    console.error("Please make sure this user exists before running the import.");
                    console.error("\nYou may need to:");
                    console.error("1. Update the user_id in test.json to match an existing user");
                    console.error("2. Or create the user first in the database");
                    return [4 /*yield*/, prisma.user.findMany({
                            select: {
                                id: true,
                                first_name: true,
                                last_name: true,
                                email: true
                            },
                            take: 10
                        })];
                case 2:
                    users = _j.sent();
                    users.forEach(function (user) {
                    });
                    return [2 /*return*/];
                case 3: return [4 /*yield*/, prisma.room.findUnique({
                        where: { id: roomId }
                    })];
                case 4:
                    roomExists = _j.sent();
                    if (!roomExists) {
                        console.error("\n\u274C ERROR: Room with id ".concat(roomId, " does not exist in the database!"));
                        console.error("Please make sure this room exists before running the import.");
                        return [2 /*return*/];
                    }
                    completedTasksImported = 0;
                    notStartedTasksImported = 0;
                    _i = 0, _a = Object.entries(testData.users);
                    _j.label = 5;
                case 5:
                    if (!(_i < _a.length)) return [3 /*break*/, 18];
                    _b = _a[_i], firebaseUserId = _b[0], userData = _b[1];
                    if (!userData.completionHistory) return [3 /*break*/, 11];
                    _c = 0, _d = Object.entries(userData.completionHistory);
                    _j.label = 6;
                case 6:
                    if (!(_c < _d.length)) return [3 /*break*/, 11];
                    _e = _d[_c], historyId = _e[0], entry = _e[1];
                    _j.label = 7;
                case 7:
                    _j.trys.push([7, 9, , 10]);
                    durationSeconds = parseDurationToSeconds(entry.duration);
                    completedAt = convertToAucklandTime(entry.timestamp);
                    return [4 /*yield*/, prisma.task.create({
                            data: {
                                user_id: userId,
                                room_id: roomId,
                                task_name: entry.task,
                                status: 'completed',
                                duration: durationSeconds,
                                completed_at: completedAt,
                                created_at: completedAt,
                                updated_at: completedAt,
                                timezone: 'Pacific/Auckland'
                            }
                        })];
                case 8:
                    _j.sent();
                    completedTasksImported++;
                    return [3 /*break*/, 10];
                case 9:
                    error_1 = _j.sent();
                    console.error("\u2717 Error importing completion history ".concat(historyId, ":"), error_1);
                    return [3 /*break*/, 10];
                case 10:
                    _c++;
                    return [3 /*break*/, 6];
                case 11:
                    if (!userData.tasks) return [3 /*break*/, 17];
                    nowAuckland = new Date();
                    _f = 0, _g = Object.entries(userData.tasks);
                    _j.label = 12;
                case 12:
                    if (!(_f < _g.length)) return [3 /*break*/, 17];
                    _h = _g[_f], taskId = _h[0], task = _h[1];
                    _j.label = 13;
                case 13:
                    _j.trys.push([13, 15, , 16]);
                    // Skip completed tasks in the tasks list
                    if (task.completed) {
                        return [3 /*break*/, 16];
                    }
                    return [4 /*yield*/, prisma.task.create({
                            data: {
                                user_id: userId,
                                room_id: roomId,
                                task_name: task.text,
                                status: 'not_started',
                                duration: 0,
                                completed_at: null, // NULL for not started tasks
                                created_at: nowAuckland,
                                updated_at: nowAuckland,
                                timezone: 'Pacific/Auckland'
                            }
                        })];
                case 14:
                    _j.sent();
                    notStartedTasksImported++;
                    return [3 /*break*/, 16];
                case 15:
                    error_2 = _j.sent();
                    console.error("\u2717 Error importing task ".concat(taskId, ":"), error_2);
                    return [3 /*break*/, 16];
                case 16:
                    _f++;
                    return [3 /*break*/, 12];
                case 17:
                    _i++;
                    return [3 /*break*/, 5];
                case 18: return [3 /*break*/, 22];
                case 19:
                    error_3 = _j.sent();
                    console.error('Fatal error:', error_3);
                    return [3 /*break*/, 22];
                case 20: return [4 /*yield*/, prisma.$disconnect()];
                case 21:
                    _j.sent();
                    return [7 /*endfinally*/];
                case 22: return [2 /*return*/];
            }
        });
    });
}
// Run the import
importTestData().catch(console.error);
