import { Test, TestingModule } from '@nestjs/testing';
import { JupiterController } from './jupiter.controller';

describe('JupiterController', () => {
  let controller: JupiterController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [JupiterController],
    }).compile();

    controller = module.get<JupiterController>(JupiterController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
