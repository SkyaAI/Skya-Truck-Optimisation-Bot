module.exports = {
  apps: [
    {
      name: 'skya-truck-bot-server',
      script: 'server/index.js',
      cwd: '/home/user/webapp',
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      max_memory_restart: '500M',
      env: {
        NODE_ENV: 'production',
        PORT: 5000
      },
      env_development: {
        NODE_ENV: 'development',
        PORT: 5000
      },
      error_file: 'logs/server-error.log',
      out_file: 'logs/server-out.log',
      log_file: 'logs/server-combined.log',
      time: true,
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      restart_delay: 2000,
      max_restarts: 10,
      min_uptime: '10s',
      kill_timeout: 5000
    },
    {
      name: 'skya-truck-bot-client',
      script: 'npm',
      args: 'start',
      cwd: '/home/user/webapp/client',
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      max_memory_restart: '300M',
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
        BROWSER: 'none',
        CI: true
      },
      env_development: {
        NODE_ENV: 'development',
        PORT: 3000,
        BROWSER: 'none'
      },
      error_file: 'logs/client-error.log',
      out_file: 'logs/client-out.log',
      log_file: 'logs/client-combined.log',
      time: true,
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      restart_delay: 3000,
      max_restarts: 5,
      min_uptime: '15s',
      kill_timeout: 10000,
      ignore_watch: ['node_modules', 'build', 'logs']
    }
  ]
};