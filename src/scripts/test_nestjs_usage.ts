import 'reflect-metadata';
import { Module, Injectable, Controller, Get } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NodeBalancerModule } from '../nestjs/node-balancer.module';
import { InjectConnectionManager } from '../nestjs/node-balancer.decorators';
import { ConnectionManager } from '../config/connectionManager';

process.on('unhandledRejection', (reason, p) => {
    console.error('Unhandled Rejection at:', p, 'reason:', reason);
    process.exit(1);
});

process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception:', err);
    process.exit(1);
});

@Injectable()
class AppService {
    constructor(
        @InjectConnectionManager() private readonly connectionManager: ConnectionManager
    ) { }

    async check() {
        if (this.connectionManager) {
            console.log('✅ ConnectionManager injected successfully!');
            const db = this.connectionManager.getDb();
            console.log(`✅ Database context available: ${db ? 'Yes' : 'No (init might be pending or failed)'}`);
            return 'ok';
        } else {
            console.error('❌ ConnectionManager failed to inject.');
            return 'fail';
        }
    }
}

@Controller()
class AppController {
    constructor(private readonly appService: AppService) { }

    @Get()
    getHello() {
        return this.appService.check();
    }
}

@Module({
    imports: [
        NodeBalancerModule.forRoot({
            nodes: ['mongodb://localhost:27017', 'mongodb://localhost:27018', 'mongodb://localhost:27019'],
            minPoolSize: 1,
            maxPoolSize: 5,
            dbName: 'test_nest'
        })
    ],
    controllers: [AppController],
    providers: [AppService],
})
class AppModule { }


async function manualTest() {
    console.log('DEBUG: Starting manual test...');
    try {
        const m = new ConnectionManager({
            nodes: ['mongodb://localhost:27017', 'mongodb://localhost:27018', 'mongodb://localhost:27019'],
            minPoolSize: 1,
            maxPoolSize: 5
        });
        await m.init();
        console.log('DEBUG: Manual test passed');
        // await m.close(); // Keep it open or close? Close.
    } catch (e) {
        console.error('DEBUG: Manual test failed', e);
    }
}

async function bootstrap() {
    console.log('🚀 Starting NestJS Context...');
    await manualTest();

    try {
        const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn', 'debug', 'verbose'] });
        const service = app.get(AppService);
        await service.check();
        await app.close();
        console.log('✅ NestJS Test Finished.');
    } catch (error) {
        console.error('❌ NestJS Boot failed:', error);
        process.exit(1);
    }
}

bootstrap();
