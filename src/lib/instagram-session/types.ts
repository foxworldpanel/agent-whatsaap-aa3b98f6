export type InstagramSessionStatus = 
  | 'never_connected' 
  | 'connecting' 
  | 'connected' 
  | 'expired' 
  | 'disconnected' 
  | 'error';

export interface InstagramSessionInfo {
  id: string;
  username: string;
  display_name?: string;
  profile_picture?: string;
  status: InstagramSessionStatus;
  last_login?: string;
  last_validation?: string;
  last_used?: string;
  storage_state_path?: string;
}

export interface InstagramLoginResult {
  success: boolean;
  username?: string;
  display_name?: string;
  profile_picture?: string;
  error?: string;
}
