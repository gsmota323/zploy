import { Request, Response } from "express";
import { createUser, getAllUsers } from "../services/userService";

export async function register(req: Request, res: Response) {
  const { email, password } = req.body;

  const user = await createUser(email, password);

  res.json(user);
}

export async function listUsers(req: Request, res: Response) {
  const users = await getAllUsers();
  res.json(users);
}