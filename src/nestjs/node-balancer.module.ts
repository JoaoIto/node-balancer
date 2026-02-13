import { DynamicModule, Module, Global, Provider } from '@nestjs/common';
import { ConnectionManager, ConnectionManagerOptions } from '../config/connectionManager';
import { NODE_BALANCER_CONNECTION } from './node-balancer.decorators';

export interface NodeBalancerModuleAsyncOptions {
    imports?: any[];
    useFactory: (...args: any[]) => Promise<ConnectionManagerOptions> | ConnectionManagerOptions;
    inject?: any[];
}

@Global()
@Module({})
export class NodeBalancerModule {
    static forRoot(options: ConnectionManagerOptions): DynamicModule {
        const connectionProvider: Provider = {
            provide: NODE_BALANCER_CONNECTION,
            useFactory: async () => {
                console.log('DEBUG: NodeBalancerModule useFactory called');
                const manager = new ConnectionManager(options);
                console.log('DEBUG: Manager created, initializing...');
                await manager.init();
                console.log('DEBUG: Manager initialized successfully');
                return manager;
            },
        };

        return {
            module: NodeBalancerModule,
            providers: [connectionProvider],
            exports: [connectionProvider],
        };
    }

    static forRootAsync(options: NodeBalancerModuleAsyncOptions): DynamicModule {
        const connectionProvider: Provider = {
            provide: NODE_BALANCER_CONNECTION,
            useFactory: async (...args: any[]) => {
                const config = await options.useFactory(...args);
                const manager = new ConnectionManager(config);
                await manager.init();
                return manager;
            },
            inject: options.inject || [],
        };

        return {
            module: NodeBalancerModule,
            imports: options.imports || [],
            providers: [connectionProvider],
            exports: [connectionProvider],
        };
    }
}
