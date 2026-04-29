import { Request, Response } from "express";
import { getAllUsers } from "../services/userService";

export async function listUsers(req: Request, res: Response) {
  // Essa rota no futuro será protegida pelo middleware JWT!
  const users = await getAllUsers();
  res.json(users);
}