import { Router } from 'express';
import { UserController } from '../controllers/user.controller';

const router = Router();
const controller = new UserController();

router.post('/', controller.create);
router.get('/', controller.list);

export default router;
