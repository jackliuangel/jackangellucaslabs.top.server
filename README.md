# jackangellucaslab.top.server
## server to host vless, nginx, react app and ssh and more



How to set up Vless:
Video
https://www.youtube.com/watch?v=eqYL6P6T9sU

Text tutorial
https://bulianglin.com/archives/nicenamebak.html

key code:
`bash <(curl -Ls https://raw.githubusercontent.com/FranzKafkaYu/x-ui/956bf85bbac978d56c0e319c5fac2d6db7df9564/install.sh) `



Nginx services :

| 项目名称   | 技术栈               | 参考github repo                    | 学习来源              |
| -------- | -------------------- | ---------------------------------- | --------------------- |
| gallery  | HTML + Tailwind CSS  | -                                  | -                     |
| pose     | HTML + JavaScript    | -                                  | -                     |
| monster  | React Web + npm      | React-beginner-tutorial-TeacherEgg | B站：技术蛋老师         |
| chores   | React Native + Expo  | React Native                       | YouTube: freeCodeCamp |
| land     | React Native + THREE | React Native                       | AI studio GEMINI demo |
| guess    | next.js + React Web  |                                    | gemini                |


## 项目说明


### gallery
- **技术栈**: HTML + Tailwind CSS
- **描述**: 图片画廊项目


### pose
- **技术栈**: HTML + JavaScript
- **描述**: 姿态相关项目


### monster， muji
- **技术栈**: React Web + npm
- **参考项目**: React-beginner-tutorial-TeacherEgg
- **学习资源**: B站 - 技术蛋老师


### chores， x, todo-like dashboard
- **技术栈**: React Native + Expo
- **参考项目**: React Native Todo
- **学习资源**: YouTube - freeCodeCamp

### land, sim city类的城市建设, skyline builder, lego city, city crafter
- **技术栈**: React Native + THRESS
- **参考项目**: AI studio GEMINI demo
- **学习资源**: [YouTube - freeCodeCamp](https://ai.studio/apps/drive/1LQM38Nqfb26ytMYDMQfERnOwRPvPZCaM)

### guess
- **技术栈**: next.js + React Web
- **参考项目**: GEMINI 
- **学习资源**: N/A. 儿童作画， 然后AI识别出你做的画的问题， 然后上色补全为粘土风格的画



# How to setup nginx server and deploy a new react app *foobar*：
- 1. 在cloudflare创建新的DNS
- 2. 在nginx server， 生成https key。 命令是
   `sudo certbot certonly --nginx -d foobar.jackangellucaslabs.top`
- 3. 在nginx server, 把打包好的dist目录， 放到 `/var/www/html/foobar-root`
- 4. 在nginx server,把  `/etc/nginx/sites-available` ， 准备好配置文件 `/var/www/html/foobar-subdomain`, 他其实是指向到
   `/home/ubuntu/jackangellucaslabs.top.server/etc/nginx/sites-available/foobar-subdomain`
- 5. 在nginx server, `/etc/nginx/sites-enabled`目录下，创建soft link `foobar-subdomain` 到 `/var/www/html/foobar-subdomain`
- 6. `sudo systemctl restart nginx`
# note：
# sudo certbot certificates 这个命令会列出所有由 Certbot 管理的证书



# How to setup nginx server and deploy a new nextjs app *foobar*：
- 1. 在cloudflare创建新的DNS
- 2. 在nginx server， 生成https key。 命令是
   `sudo certbot certonly --nginx -d foobar.jackangellucaslabs.top`
- 3. 在nginx server, 把打包好的.next目录， 放到 `/var/www/foobar-root`
- 4. 在nginx server,把  `/etc/nginx/sites-available` ， 准备好配置文件 `/var/www/html/foobar-subdomain`, 他其实是指向到
   `/home/ubuntu/jackangellucaslabs.top.server/etc/nginx/sites-available/foobar-subdomain`
- 5. 在nginx server, `/etc/nginx/sites-enabled`目录下，创建soft link `foobar-subdomain` 到 `/var/www/html/foobar-subdomain`
- 6. pm2 start server.js --name "foo-bar" 把这个服务deploy 到3000端口， 然后把subdomain映射到本地的3000 端口， 参见guess-subdomain
- 7. `sudo systemctl restart nginx`
# note：
# 停止旧pm2服务
# pm2 delete drawing-guessing
# 重启所有pm2服务
# pm2 restart all
