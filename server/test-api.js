const http = require('http');

const request = (options, postData) => {
    return new Promise((resolve, reject) => {
        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    resolve({ status: res.statusCode, data: JSON.parse(data) });
                } catch(e) {
                    resolve({ status: res.statusCode, data });
                }
            });
        });
        req.on('error', reject);
        if (postData) {
            req.write(JSON.stringify(postData));
        }
        req.end();
    });
};

const runTests = async () => {
    const baseUrl = 'http://127.0.0.1:9000';
    const testUser = { username: 'testuser_' + Date.now(), password: 'password123' };
    let token = '';

    console.log('--- 开始测试后端 API ---');

    // 1. 注册
    let res = await request({
        hostname: '127.0.0.1', port: 9000, path: '/auth/register', method: 'POST',
        headers: { 'Content-Type': 'application/json' }
    }, testUser);
    console.log('注册:', res.data.success ? '成功' : '失败');
    token = res.data.user.sessionToken;

    // 2. 登录
    res = await request({
        hostname: '127.0.0.1', port: 9000, path: '/auth/login', method: 'POST',
        headers: { 'Content-Type': 'application/json' }
    }, testUser);
    console.log('登录:', res.data.success ? '成功' : '失败');

    // 3. 上传存档
    res = await request({
        hostname: '127.0.0.1', port: 9000, path: '/saves', method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token }
    }, { slotIndex: 1, saveData: { level: 5, gold: 100 }, saveTime: Date.now() });
    console.log('上传存档:', res.data.success ? '成功' : '失败');

    // 4. 读取存档
    res = await request({
        hostname: '127.0.0.1', port: 9000, path: '/saves', method: 'GET',
        headers: { 'Authorization': 'Bearer ' + token }
    });
    console.log('读取存档:', res.data.success && res.data.data.length === 1 ? '成功' : '失败');

    // 5. 上传残影
    res = await request({
        hostname: '127.0.0.1', port: 9000, path: '/ghosts/current', method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token }
    }, { realm: 3, ghostData: { name: 'TestPlayer', hp: 500 } });
    console.log('上传残影:', res.data.success ? '成功' : '失败');

    // 6. 随机拉取残影 (不带 token 以拉取自己的进行验证)
    res = await request({
        hostname: '127.0.0.1', port: 9000, path: '/ghosts/random?realm=3', method: 'GET'
    });
    console.log('拉取残影:', res.data.success ? '成功' : '失败', res.data.data ? res.data.data.userName : '');
    
    console.log('--- 测试结束 ---');
};

runTests();
