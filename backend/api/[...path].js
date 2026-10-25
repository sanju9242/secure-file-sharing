process.env.NODE_ENV = 'test';

const { default: app } = await import('../server.js');

export default app;
