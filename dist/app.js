"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const dotenv_1 = __importDefault(require("dotenv"));
const logger_1 = require("./middlewares/logger");
const database_1 = require("./config/database");
const user_route_1 = __importDefault(require("./routes/user.route"));
const dbLogger_1 = require("./middlewares/dbLogger");
dotenv_1.default.config();
(0, database_1.connectDatabase)();
const app = (0, express_1.default)();
app.use(express_1.default.json());
app.use(logger_1.morganMiddleware);
app.use(dbLogger_1.dbLogger);
app.use('/api/users', user_route_1.default);
app.get('/', (req, res) => {
    res.status(200).json({ message: 'Node balancer online!' });
});
exports.default = app;
