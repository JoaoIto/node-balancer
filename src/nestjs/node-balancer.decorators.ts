import { Inject } from '@nestjs/common';

export const NODE_BALANCER_CONNECTION = 'NODE_BALANCER_CONNECTION';

export function InjectConnectionManager() {
    return Inject(NODE_BALANCER_CONNECTION);
}
