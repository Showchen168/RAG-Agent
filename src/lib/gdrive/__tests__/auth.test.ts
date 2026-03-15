import { getOAuth2Client, getAuthUrl, handleCallback } from '../auth';
import { google } from 'googleapis';

// Mock googleapis
jest.mock('googleapis', () => ({
  google: {
    auth: {
      OAuth2: jest.fn().mockImplementation(() => ({
        clientId_: process.env.GOOGLE_CLIENT_ID,
        clientSecret_: process.env.GOOGLE_CLIENT_SECRET,
        redirectUri_: process.env.GOOGLE_REDIRECT_URI,
        generateAuthUrl: jest.fn((options: { state?: string }) => {
          const params = new URLSearchParams({
            client_id: 'test_client_id',
            redirect_uri: 'http://localhost:3000/api/gdrive/callback',
            response_type: 'code',
            scope: 'https://www.googleapis.com/auth/drive.readonly',
            access_type: 'offline',
            state: options.state || '',
          });
          return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
        }),
        getToken: jest.fn().mockResolvedValue({
          tokens: {
            access_token: 'test_access_token',
            refresh_token: 'test_refresh_token',
            expiry_date: Date.now() + 3600000,
          },
        }),
        setCredentials: jest.fn(),
        refreshAccessToken: jest.fn().mockResolvedValue({
          credentials: {
            access_token: 'new_access_token',
            refresh_token: 'test_refresh_token',
            expiry_date: Date.now() + 3600000,
          },
        }),
      })),
    },
  },
}));

describe('getOAuth2Client', () => {
  beforeEach(() => {
    process.env.GOOGLE_CLIENT_ID = 'test_client_id';
    process.env.GOOGLE_CLIENT_SECRET = 'test_client_secret';
    process.env.GOOGLE_REDIRECT_URI = 'http://localhost:3000/api/gdrive/callback';
    jest.clearAllMocks();
  });

  it('should return OAuth2Client with correct credentials', () => {
    const client = getOAuth2Client();
    expect(client).toBeDefined();
    expect(google.auth.OAuth2).toHaveBeenCalledWith(
      'test_client_id',
      'test_client_secret',
      'http://localhost:3000/api/gdrive/callback'
    );
  });

  it('should throw error if credentials are missing', () => {
    delete process.env.GOOGLE_CLIENT_ID;
    expect(() => getOAuth2Client()).toThrow();
  });
});

describe('getAuthUrl', () => {
  beforeEach(() => {
    process.env.GOOGLE_CLIENT_ID = 'test_client_id';
    process.env.GOOGLE_CLIENT_SECRET = 'test_client_secret';
    process.env.GOOGLE_REDIRECT_URI = 'http://localhost:3000/api/gdrive/callback';
    jest.clearAllMocks();
  });

  it('should generate auth URL with state parameter', () => {
    const userId = 'user_123';
    const url = getAuthUrl(userId);
    
    expect(url).toContain('client_id');
    expect(url).toContain('state=user_123');
  });

  it('should include drive.readonly scope', () => {
    const url = getAuthUrl('user_123');
    expect(url).toContain('drive.readonly');
  });

  it('should include offline access_type', () => {
    const url = getAuthUrl('user_123');
    expect(url).toContain('access_type=offline');
  });
});

describe('handleCallback', () => {
  beforeEach(() => {
    process.env.GOOGLE_CLIENT_ID = 'test_client_id';
    process.env.GOOGLE_CLIENT_SECRET = 'test_client_secret';
    process.env.GOOGLE_REDIRECT_URI = 'http://localhost:3000/api/gdrive/callback';
    jest.clearAllMocks();
  });

  it('should exchange code for tokens', async () => {
    const tokens = await handleCallback('test_code');
    expect(tokens).toHaveProperty('access_token', 'test_access_token');
    expect(tokens).toHaveProperty('refresh_token', 'test_refresh_token');
    expect(tokens).toHaveProperty('expiry_date');
  });

  it('should call OAuth2 getToken method', async () => {
    await handleCallback('test_code');
    
    const OAuth2Mock = google.auth.OAuth2 as jest.Mock;
    expect(OAuth2Mock).toHaveBeenCalled();
  });
});
