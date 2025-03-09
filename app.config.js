// Simple app config that exposes environment variables to the app
export default ({ config }) => ({
  ...config,
  extra: {
    groqApiKey: process.env.GROQ_API_KEY || null,
  }
});
