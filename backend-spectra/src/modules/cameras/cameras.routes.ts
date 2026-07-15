import { Router } from 'express';
import * as camerasController from './cameras.controller.js';

export const camerasRouter = Router();

camerasRouter.get('/', camerasController.listCameras);
camerasRouter.post('/', camerasController.createCamera);
camerasRouter.patch('/:id', camerasController.updateCamera);
camerasRouter.delete('/:id', camerasController.deleteCamera);
