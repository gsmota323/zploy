import { Request, Response } from "express";
import { Prisma } from "@prisma/client";
import { authenticateUser } from "../services/authService"; 
import { createUser } from "../services/userService";


export async function register(req: Request, res: Response) {
  const { email, password, username } = req.body;
  const normalizedEmail = String(email || "").trim().toLowerCase();
  const normalizedUsername = String(username || "").trim().toLowerCase();

  if (!normalizedEmail || !password || !normalizedUsername) {
    return res.status(400).json({ error: "E-mail, usuário e senha são obrigatórios" });
  }

  if (!/^[a-z0-9._-]{3,30}$/.test(normalizedUsername)) {
    return res.status(400).json({ error: "Nome de usuário inválido" });
  }

  if (String(password).length < 6) {
    return res.status(400).json({ error: "A senha deve ter no mínimo 6 caracteres" });
  }

  try {
    // A lógica de hash fica dentro do service
    const user = await createUser(normalizedEmail, password, normalizedUsername); 
    return res.status(201).json(user);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return res.status(409).json({ error: "E-mail ou nome de usuário já está em uso" });
    }

    return res.status(500).json({ error: "Erro ao criar conta" });
  }
}

export async function login(req: Request, res: Response) {
  const { email, username, identifier, password } = req.body;
  const loginIdentifier = identifier || username || email;

  if (!loginIdentifier || !password) {
    return res.status(400).json({ error: "Usuário/e-mail e senha são obrigatórios" });
  }
  
  // service vai verificar o bcrypt.compare e gerar o JWT
  const token = await authenticateUser(loginIdentifier, password);
  
  if (!token) {
    return res.status(401).json({ error: "Credenciais inválidas" });
  }

  res.json({ token });
}