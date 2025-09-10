import {defineConfig} from 'vite';

export default defineConfig({
        server: {
            port: 5173,
            proxy: {
                '/theta': {
                    target: 'https://ondemand.thetaedgecloud.com',
                    changeOrigin: true,
                    secure: true,
                    rewrite: (path) => path.replace(/^\/theta(\/|$)/, '/'),
                },
                '/gcs': {
                    target: 'https://storage.googleapis.com',
                    changeOrigin: true,
                    secure: true,
                    rewrite: (p) => p.replace(/^\/gcs(\/|$)/, '/'),
                },
            },
        },
    }
)
