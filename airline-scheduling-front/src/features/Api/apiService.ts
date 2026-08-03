// apiService.ts (Front-end)
import axios from 'axios';

// URL de base de votre API NestJS - SANS /api car votre back écoute à la racine
// Ajustez le port si nécessaire, par exemple à 3001 pour correspondre à votre back-end
const API_URL = 'http://localhost:3001'; 

// Fonction pour l'inscription (Sign Up)
// Appelle le endpoint POST http://localhost:3001/users
export const signUp = async (userData: any) => {
  try {
    const response = await axios.post(`${API_URL}/users`, userData);
    return response.data;
  } catch (error: any) {
    // Gérer l'erreur renvoyée par NestJS (par exemple, ConflictException si l'email existe déjà)
    if (error.response && error.response.data && error.response.data.message) {
      throw new Error(error.response.data.message);
    }
    throw new Error('Une erreur s\'est produite lors de l\'inscription.');
  }
};

// Fonction pour la connexion (Log In)
// Appelle le endpoint POST http://localhost:3001/users/login 
// car la logique de login a été intégrée dans le UsersController du back-end.
export const logIn = async (loginData: any) => {
  try {
    const response = await axios.post(`${API_URL}/users/login`, loginData); 
    
    // Enregistrez le token de session de manière sécurisée dans le stockage local
    if (response.data && response.data.token) {
      localStorage.setItem('userToken', response.data.token);
    }
    
    return response.data; // Retourne l'utilisateur (sans mdp) et le token simulé
  } catch (error: any) {
    // Gérer l'erreur d'identifiants incorrects renvoyée par le contrôleur (UnauthorizedException)
    if (error.response && error.response.data && error.response.data.message) {
      throw new Error(error.response.data.message);
    }
    throw new Error('Email ou mot de passe incorrect.');
  }
};