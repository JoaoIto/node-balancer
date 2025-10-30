import { Request, Response } from 'express';
import { UserService } from '../services/user.service';

const userService = new UserService();

export class UserController {
    async create(req: Request, res: Response): Promise<void> {
        try {
            const user = await userService.createUser(req.body);
            res.status(201).json(user);
        } catch (error) {
            res.status(400).json({ error: 'Erro ao criar usuário', details: error });
        }
    }

    async list(req: Request, res: Response): Promise<void> {
        const users = await userService.getAllUsers();
        res.json(users);
    }
}
