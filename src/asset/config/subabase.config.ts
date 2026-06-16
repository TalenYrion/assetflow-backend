import { registerAs } from '@nestjs/config';

export default registerAs('supabase', () => {
  return {
    key: process.env.SUPABASE_KEY,
    url: process.env.SUPABASE_URL,
    assetBucket: process.env.SUPABASE_ASSET_BUCKET,
    thumbBucket: process.env.SUPABASE_THUMBNAIL_BUCKET,
    userProfileBucket: process.env.SUPABASE_USER_PROFILE,
  };
});
