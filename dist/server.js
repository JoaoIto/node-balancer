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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const app_1 = __importDefault(require("./app"));
const logger_1 = require("./middlewares/logger");
const websocket_1 = require("./config/websocket");
const metrics_1 = require("./config/metrics");
const PORT = process.env.PORT || 3000;
app_1.default.get('/metrics', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        res.set('Content-Type', metrics_1.register.contentType);
        res.end(yield metrics_1.register.metrics());
    }
    catch (ex) {
        res.status(500).end(ex);
    }
}));
const server = app_1.default.listen(PORT, () => {
    logger_1.logger.info(`Servidor rodando na porta ${PORT}`);
});
(0, websocket_1.initWebSocket)(server);
