import { User, IUser } from '../models/User.model';

export class UserService {
    async createUser(data: IUser): Promise<IUser> {
        const user = new User(data);
        return user.save();
    }

    async getAllUsers(): Promise<IUser[]> {
        return User.find();
    }
}
