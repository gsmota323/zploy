import { Request, Response } from "express";
import { authenticateUser } from "../services/authService"; 
import { createUser } from "../services/userService";

export async function register(req: Request, res: Response) {
  const { email, password } = req.body;
  // A lógica de hash fica dentro do service
  const user = await createUser(email, password); 
  res.status(201).json(user);
}

export async function login(req: Request, res: Response) {
  const { email, password } = req.body;
  
  // O service vai verificar o bcrypt.compare e gerar o JWT
  const token = await authenticateUser(email, password);
  
  if (!token) {
    return res.status(401).json({ error: "Credenciais inválidas" });
  }

  res.json({ token });
}