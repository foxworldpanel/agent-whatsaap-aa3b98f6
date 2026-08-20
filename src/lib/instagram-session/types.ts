export type InstagramSessionStatus = 
  | 'NEVER_CONNECTED' 
  | 'CONNECTING' 
  | 'CONNECTED' 
  | 'EXPIRED' 
  | 'DISCONNECTED' 
  | 'ERROR';

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
  storageState?: any;
  error?: string;
}
