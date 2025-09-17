import { Test, TestingModule } from '@nestjs/testing';
import { JupiterService } from './jupiter.service';

describe('JupiterService', () => {
  let service: JupiterService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [JupiterService],
    }).compile();

    service = module.get<JupiterService>(JupiterService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
