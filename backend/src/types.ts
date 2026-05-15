export interface Env {
  DB: D1Database;
  CHAT_ROOM: DurableObjectNamespace;
  JWT_SECRET: string;
  ADMIN_USERNAME: string;
  ALLOWED_ORIGIN?: string;
  VAPID_PUBLIC_KEY?: string;
  VAPID_PRIVATE_KEY_JWK?: string;
  VAPID_CONTACT?: string;
}

export interface User {
  id: string;
  username: string;
  password_hash: string;
  display_name: string | null;
  public_key: string | null;
  encrypted_private_key: string | null;
  created_at: number;
  last_seen: number | null;
}

export interface Session {
  token_id: string;
  user_id: string;
  created_at: number;
  expires_at: number;
}

export interface Conversation {
  id: string;
  type: 'direct' | 'group';
  name: string | null;
  created_by: string;
  created_at: number;
}

export interface ConversationMember {
  conversation_id: string;
  user_id: string;
  joined_at: number;
}

export interface Message {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string;
  nonce: string | null;
  recipient_keys: string | null;
  created_at: number;
  edited_at: number | null;
  expires_at: number | null;
}

export interface MessageRead {
  message_id: string;
  user_id: string;
  read_at: number;
}

export interface JWTPayload {
  sub: string;
  jti: string;
  exp: number;
}

export interface AuthContext {
  user: User;
  tokenId: string;
}
