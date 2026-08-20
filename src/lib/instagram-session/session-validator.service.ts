import { PlaywrightSessionService } from './playwright-session.service';

export class SessionValidatorService {
  static async validate(credentialId: string): Promise<boolean> {
    return await PlaywrightSessionService.validateSession(credentialId);
  }
}
