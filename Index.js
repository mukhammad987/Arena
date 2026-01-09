class HandGestureGame {
    constructor() {
        this.gameState = {
            score: 0,
            lives: 3,
            level: 1,
            gameActive: false,
            paused: false,
            currentGesture: '-',
            difficulty: 'medium',
            enemies: [],
            bonuses: [],
            player: { x: 400, y: 300, width: 60, height: 80, attacking: false, defending: false }
        };
        
        this.hands = null;
        this.camera = null;
        this.canvas = null;
        this.ctx = null;
        this.lastGestureTime = 0;
        this.gestureCooldown = 500; // мс
        
        this.init();
    }
    
    init() {
        this.setupEventListeners();
        this.setupCanvas();
        this.setupMediaPipe();
        this.updateUI();
    }
    
    setupEventListeners() {
        document.getElementById('startCamera').addEventListener('click', () => this.startCamera());
        document.getElementById('pauseGame').addEventListener('click', () => this.togglePause());
        document.getElementById('fullscreen').addEventListener('click', () => this.toggleFullscreen());
        document.getElementById('startGame').addEventListener('click', () => this.startGame());
        
        // Кнопки сложности
        document.querySelectorAll('.diff-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('.diff-btn').forEach(b => b.classList.remove('active'));
                e.target.classList.add('active');
                this.gameState.difficulty = e.target.dataset.diff;
            });
        });
        
        // Обработка клавиш
        document.addEventListener('keydown', (e) => {
            if (e.code === 'Space') this.togglePause();
            if (e.code === 'Escape') this.showMenu();
        });
    }
    
    setupCanvas() {
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.canvas.width = this.canvas.offsetWidth;
        this.canvas.height = this.canvas.offsetHeight;
        
        // Начальные враги и бонусы
        this.spawnEnemies(5);
        this.spawnBonuses(3);
    }
    
    setupMediaPipe() {
        this.hands = new Hands({
            locateFile: (file) => {
                return `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`;
            }
        });
        
        this.hands.setOptions({
            maxNumHands: 1,
            modelComplexity: 1,
            minDetectionConfidence: 0.5,
            minTrackingConfidence: 0.5
        });
        
        this.hands.onResults((results) => this.onHandResults(results));
    }
    
    startCamera() {
        const video = document.getElementById('input_video');
        const canvas = document.getElementById('output_canvas');
        const canvasCtx = canvas.getContext('2d');
        
        this.camera = new Camera(video, {
            onFrame: async () => {
                await this.hands.send({image: video});
            },
            width: 640,
            height: 480
        });
        
        this.camera.start();
        this.addLog('Камера запущена. Покажите руку в кадр.');
    }
    
    onHandResults(results) {
        const video = document.getElementById('input_video');
        const canvas = document.getElementById('output_canvas');
        const canvasCtx = canvas.getContext('2d');
        
        // Отрисовка скелета руки
        canvasCtx.save();
        canvasCtx.clearRect(0, 0, canvas.width, canvas.height);
        canvasCtx.drawImage(results.image, 0, 0, canvas.width, canvas.height);
        
        if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
            for (const landmarks of results.multiHandLandmarks) {
                drawConnectors(canvasCtx, landmarks, HAND_CONNECTIONS, {color: '#00FF00', lineWidth: 2});
                drawLandmarks(canvasCtx, landmarks, {color: '#FF0000', lineWidth: 1});
                
                // Определение жеста
                if (this.gameState.gameActive && !this.gameState.paused) {
                    this.detectGesture(landmarks);
                }
            }
        }
        
        canvasCtx.restore();
        
        // Обновление отображения жеста
        document.getElementById('gesture').textContent = this.gameState.currentGesture;
    }
    
    detectGesture(landmarks) {
        const now = Date.now();
        if (now - this.lastGestureTime < this.gestureCooldown) return;
        
        // Получаем координаты ключевых точек
        const thumbTip = landmarks[4];
        const indexTip = landmarks[8];
        const middleTip = landmarks[12];
        const ringTip = landmarks[16];
        const pinkyTip = landmarks[20];
        const wrist = landmarks[0];
        
        // Расстояния от кончиков пальцев до запястья
        const distances = {
            thumb: Math.abs(thumbTip.y - wrist.y),
            index: Math.abs(indexTip.y - wrist.y),
            middle: Math.abs(middleTip.y - wrist.y),
            ring: Math.abs(ringTip.y - wrist.y),
            pinky: Math.abs(pinkyTip.y - wrist.y)
        };
        
        // Определение жеста
        let gesture = '-';
        
        // Кулак (все пальцы согнуты)
        if (distances.index < 0.1 && distances.middle < 0.1 && distances.ring < 0.1 && distances.pinky < 0.1) {
            gesture = '✊ КУЛАК';
            this.gameState.player.attacking = true;
            this.gameState.player.defending = false;
            this.attack();
        }
        // Ладонь (все пальцы выпрямлены)
        else if (distances.index > 0.2 && distances.middle > 0.2 && distances.ring > 0.2 && distances.pinky > 0.2) {
            gesture = '✋ ЛАДОНЬ';
            this.gameState.player.attacking = false;
            this.gameState.player.defending = true;
            this.defend();
        }
        // 1 палец
        else if (distances.index > 0.2 && distances.middle < 0.1 && distances.ring < 0.1 && distances.pinky < 0.1) {
            gesture = '☝️ 1 ПАЛЕЦ';
            this.movePlayer('up');
        }
        // 2 пальца
        else if (distances.index > 0.2 && distances.middle > 0.2 && distances.ring < 0.1 && distances.pinky < 0.1) {
            gesture = '✌️ 2 ПАЛЬЦА';
            this.movePlayer('right');
        }
        // 3 пальца
        else if (distances.index > 0.2 && distances.middle > 0.2 && distances.ring > 0.2 && distances.pinky < 0.1) {
            gesture = '🤟 3 ПАЛЬЦА';
            this.movePlayer('left');
        }
        // 5 пальцев
        else if (distances.index > 0.2 && distances.middle > 0.2 && distances.ring > 0.2 && distances.pinky > 0.2) {
            gesture = '🖐️ 5 ПАЛЬЦЕВ';
            this.movePlayer('down');
        }
        
        if (gesture !== '-' && gesture !== this.gameState.currentGesture) {
            this.gameState.currentGesture = gesture;
            this.lastGestureTime = now;
            this.addLog(`Распознан жест: ${gesture}`);
        }
    }
    
    movePlayer(direction) {
        const speed = 15;
        switch(direction) {
            case 'up': this.gameState.player.y = Math.max(50, this.gameState.player.y - speed); break;
            case 'down': this.gameState.player.y = Math.min(this.canvas.height - 100, this.gameState.player.y + speed); break;
            case 'left': this.gameState.player.x = Math.max(50, this.gameState.player.x - speed); break;
            case 'right': this.gameState.player.x = Math.min(this.canvas.width - 50, this.gameState.player.x + speed); break;
        }
    }
    
    attack() {
        // Уничтожение врагов вблизи игрока
        this.gameState.enemies = this.gameState.enemies.filter(enemy => {
            const distance = Math.sqrt(
                Math.pow(enemy.x - this.gameState.player.x, 2) + 
                Math.pow(enemy.y - this.gameState.player.y, 2)
            );
            
            if (distance < 100) {
                this.gameState.score += 10;
                this.addLog(`Враг уничтожен! +10 очков`);
                this.updateMissions('enemy');
                return false;
            }
            return true;
        });
        
        // Добавляем врагов если нужно
        if (this.gameState.enemies.length < 3) {
            this.spawnEnemies(2);
        }
    }
    
    defend() {
        // Временно защищает от врагов
        this.addLog('Защита активирована');
    }
    
    spawnEnemies(count) {
        for (let i = 0; i < count; i++) {
            this.gameState.enemies.push({
                x: Math.random() * (this.canvas.width - 100) + 50,
                y: Math.random() * (this.canvas.height - 150) + 50,
                width: 40,
                height: 40,
                speed: 1 + Math.random() * 2,
                type: Math.random() > 0.7 ? 'strong' : 'normal',
                color: Math.random() > 0.7 ? '#FF0000' : '#FF5555'
            });
        }
    }
    
    spawnBonuses(count) {
        for (let i = 0; i < count; i++) {
            this.gameState.bonuses.push({
                x: Math.random() * (this.canvas.width - 50) + 25,
                y: Math.random() * (this.canvas.height - 100) + 25,
                width: 30,
                height: 30,
                type: ['health', 'points', 'speed'][Math.floor(Math.random() * 3)],
                collected: false
            });
        }
    }
    
    startGame() {
        document.getElementById('startScreen').classList.add('hidden');
        this.gameState.gameActive = true;
        this.gameLoop();
        this.addLog('Игра началась!');
    }
    
    gameLoop() {
        if (!this.gameState.gameActive || this.gameState.paused) return;
        
        this.update();
        this.render();
        
        requestAnimationFrame(() => this.gameLoop());
    }
    
    update() {
        // Движение врагов к игроку
        this.gameState.enemies.forEach(enemy => {
            const dx = this.gameState.player.x - enemy.x;
            const dy = this.gameState.player.y - enemy.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            if (distance > 0) {
                enemy.x += (dx / distance) * enemy.speed;
                enemy.y += (dy / distance) * enemy.speed;
            }
            
            // Проверка столкновения с игроком
            if (!this.gameState.player.defending) {
                const collision = this.checkCollision(this.gameState.player, enemy);
                if (collision) {
                    this.gameState.lives--;
                    this.addLog('Враг атаковал! -1 жизнь');
                    enemy.x = Math.random() * this.canvas.width;
                    enemy.y = Math.random() * this.canvas.height;
                    
                    if (this.gameState.lives <= 0) {
                        this.gameOver();
                    }
                }
            }
        });
        
        // Проверка бонусов
        this.gameState.bonuses.forEach(bonus => {
            if (!bonus.collected && this.checkCollision(this.gameState.player, bonus)) {
                bonus.collected = true;
                this.collectBonus(bonus);
            }
        });
        
        // Фильтруем собранные бонусы
        this.gameState.bonuses = this.gameState.bonuses.filter(b => !b.collected);
        
        // Добавляем новые бонусы
        if (this.gameState.bonuses.length < 2 && Math.random() < 0.01) {
            this.spawnBonuses(1);
        }
        
        this.updateUI();
    }
    
    checkCollision(rect1, rect2) {
        return rect1.x < rect2.x + rect2.width &&
               rect1.x + rect1.width > rect2.x &&
               rect1.y < rect2.y + rect2.height &&
               rect1.y + rect1.height > rect2.y;
    }
    
    collectBonus(bonus) {
        switch(bonus.type) {
            case 'health':
                this.gameState.lives = Math.min(3, this.gameState.lives + 1);
                this.addLog('❤️ Бонус здоровья! +1 жизнь');
                break;
            case 'points':
                this.gameState.score += 50;
                this.addLog('⭐ Бонус очков! +50 очков');
                this.updateMissions('bonus');
                break;
            case 'speed':
                this.addLog('⚡ Бонус скорости!');
                break;
        }
    }
    
    updateMissions(type) {
        // Обновление миссий
        const mission1 = document.getElementById('mission1');
        const mission2 = document.getElementById('mission2');
        
        if (type === 'enemy') {
            // Обновляем счетчик уничтоженных врагов
            const text = mission1.querySelector('span');
            const match = text.textContent.match(/\((\d+)\/10\)/);
            if (match) {
                const current = parseInt(match[1]) + 1;
                text.textContent = `УНИЧТОЖИТЬ 10 ВРАГОВ (${current}/10)`;
                
                if (current >= 10) {
                    mission1.querySelector('input').checked = true;
                    this.gameState.score += 100;
                    this.addLog('🎯 Миссия выполнена: Уничтожить 10 врагов! +100 очков');
                }
            }
        }
        
        if (type === 'bonus') {
            const text = mission2.querySelector('span');
            const match = text.textContent.match(/\((\d+)\/5\)/);
            if (match) {
                const current = parseInt(match[1]) + 1;
                text.textContent = `СОБРАТЬ 5 БОНУСОВ (${current}/5)`;
                
                if (current >= 5) {
                    mission2.querySelector('input').checked = true;
                    this.gameState.score += 100;
                    this.addLog('🎯 Миссия выполнена: Собрать 5 бонусов! +100 очков');
                }
            }
        }
        
        // Проверка уровня
        if (this.gameState.score >= this.gameState.level * 100) {
            this.levelUp();
        }
    }
    
    levelUp() {
        this.gameState.level++;
        this.addLog(`🎉 УРОВЕНЬ ${this.gameState.level}!`);
        
        // Увеличиваем сложность
        this.gameState.enemies.forEach(enemy => {
            enemy.speed *= 1.2;
        });
        
        // Спавним больше врагов
        this.spawnEnemies(this.gameState.level + 2);
    }
    
    render() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        // Фон
        this.ctx.fillStyle = '#111';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        
        // Сетка
        this.ctx.strokeStyle = 'rgba(0, 255, 255, 0.1)';
        this.ctx.lineWidth = 1;
        for (let x = 0; x < this.canvas.width; x += 50) {
            this.ctx.beginPath();
            this.ctx.moveTo(x, 0);
            this.ctx.lineTo(x, this.canvas.height);
            this.ctx.stroke();
        }
        for (let y = 0; y < this.canvas.height; y += 50) {
            this.ctx.beginPath();
            this.ctx.moveTo(0, y);
            this.ctx.lineTo(this.canvas.width, y);
            this.ctx.stroke();
        }
        
        // Игрок
        this.ctx.save();
        this.ctx.translate(this.gameState.player.x, this.gameState.player.y);
        
        if (this.gameState.player.attacking) {
            this.ctx.fillStyle = '#FF0000';
            this.ctx.beginPath();
            this.ctx.arc(0, 0, 40, 0, Math.PI * 2);
            this.ctx.fill();
            
            // Эффект атаки
            this.ctx.strokeStyle = '#FF5555';
            this.ctx.lineWidth = 3;
            this.ctx.beginPath();
            this.ctx.arc(0, 0, 50, 0, Math.PI * 2);
            this.ctx.stroke();
        } else if (this.gameState.player.defending) {
            this.ctx.fillStyle = '#00FF00';
            this.ctx.beginPath();
            this.ctx.arc(0, 0, 40, 0, Math.PI * 2);
            this.ctx.fill();
            
            // Щит
            this.ctx.strokeStyle = '#00FF88';
            this.ctx.lineWidth = 5;
            this.ctx.beginPath();
            this.ctx.arc(0, 0, 45, 0, Math.PI * 2);
            this.ctx.stroke();
        } else {
            this.ctx.fillStyle = '#0088FF';
            this.ctx.beginPath();
            this.ctx.arc(0, 0, 30, 0, Math.PI * 2);
            this.ctx.fill();
        }
        
        // Голова игрока
        this.ctx.fillStyle = '#FFFFFF';
        this.ctx.beginPath();
        this.ctx.arc(0, -20, 15, 0, Math.PI * 2);
        this.ctx.fill();
        
        this.ctx.restore();
        
        // Враги
        this.gameState.enemies.forEach(enemy => {
            this.ctx.fillStyle = enemy.color;
            this.ctx.beginPath();
            this.ctx.arc(enemy.x, enemy.y, 20, 0, Math.PI * 2);
            this.ctx.fill();
            
            // Глаза
            this.ctx.fillStyle = '#FFFFFF';
            this.ctx.beginPath();
            this.ctx.arc(enemy.x - 8, enemy.y - 5, 5, 0, Math.PI * 2);
            this.ctx.fill();
            this.ctx.beginPath();
            this.ctx.arc(enemy.x + 8, enemy.y - 5, 5, 0, Math.PI * 2);
            this.ctx.fill();
        });
        
        // Бонусы
        this.gameState.bonuses.forEach(bonus => {
            if (!bonus.collected) {
                this.ctx.save();
                this.ctx.translate(bonus.x, bonus.y);
                
                switch(bonus.type) {
                    case 'health':
                        this.ctx.fillStyle = '#FF0000';
                        this.ctx.beginPath();
                        this.ctx.moveTo(0, -15);
                        this.ctx.lineTo(10, 10);
                        this.ctx.lineTo(0, 5);
                        this.ctx.lineTo(-10, 10);
                        this.ctx.closePath();
                        this.ctx.fill();
                        break;
                    case 'points':
                        this.ctx.fillStyle = '#FFFF00';
                        this.ctx.beginPath();
                        this.ctx.arc(0, 0, 15, 0, Math.PI * 2);
                        this.ctx.fill();
                        this.ctx.fillStyle = '#000';
                        this.ctx.font = 'bold 20px Arial';
                        this.ctx.textAlign = 'center';
                        this.ctx.textBaseline = 'middle';
                        this.ctx.fillText('$', 0, 0);
                        break;
                    case 'speed':
                        this.ctx.fillStyle = '#00FFFF';
                        this.ctx.beginPath();
                        this.ctx.moveTo(-15, 0);
                        this.ctx.lineTo(15, 0);
                        this.ctx.lineTo(0, 20);
                        this.ctx.closePath();
                        this.ctx.fill();
                        break;
                }
                
                this.ctx.restore();
            }
        });
        
        // Отображение жеста над игроком
        this.ctx.fillStyle = '#FFFFFF';
        this.ctx.font = 'bold 24px Arial';
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'bottom';
        this.ctx.fillText(this.gameState.currentGesture.split(' ')[0], this.gameState.player.x, this.gameState.player.y - 50);
    }
    
    updateUI() {
        document.getElementById('score').textContent = this.gameState.score;
        document.getElementById('level').textContent = this.gameState.level;
        
        let livesText = '';
        for (let i = 0; i < 3; i++) {
            livesText += i < this.gameState.lives ? '❤️' : '🖤';
        }
        document.getElementById('lives').textContent = livesText;
    }
    
    addLog(message) {
        const log = document.getElementById('gestureLog');
        const entry = document.createElement('div');
        entry.textContent = `> ${new Date().toLocaleTimeString()}: ${message}`;
        log.appendChild(entry);
        log.scrollTop = log.scrollHeight;
        
        // Ограничиваем количество записей
        while (log.children.length > 10) {
            log.removeChild(log.firstChild);
        }
    }
    
    togglePause() {
        this.gameState.paused = !this.gameState.paused;
        const btn = document.getElementById('pauseGame');
        btn.textContent = this.gameState.paused ? '▶️ ПРОДОЛЖИТЬ' : '⏸️ ПАУЗА';
        btn.classList.toggle('pause', !this.gameState.paused);
        btn.classList.toggle('start', this.gameState.paused);
        
        if (!this.gameState.paused) {
            this.gameLoop();
        }
    }
    
    toggleFullscreen() {
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen().catch(err => {
                this.addLog(`Ошибка полноэкранного режима: ${err.message}`);
            });
        } else {
            if (document.exitFullscreen) {
                document.exitFullscreen();
            }
        }
    }
    
    gameOver() {
        this.gameState.gameActive = false;
        this.addLog('💀 ИГРА ОКОНЧЕНА!');
        alert(`Игра окончена! Ваш счет: ${this.gameState.score}\nУровень: ${this.gameState.level}`);
        
        setTimeout(() => {
            location.reload();
        }, 3000);
    }
    
    showMenu() {
        document.getElementById('gameMenu').classList.remove('hidden');
        this.gameState.paused = true;
    }
}

// Функции для меню
function resumeGame() {
    document.getElementById('gameMenu').classList.add('hidden');
    game.gameState.paused = false;
    game.gameLoop();
}

function restartGame() {
    location.reload();
}

function changeDifficulty() {
    document.getElementById('gameMenu').classList.add('hidden');
    document.getElementById('startScreen').classList.remove('hidden');
}

function showControls() {
    alert('Управление жестами:\n✊ - Атака\n✋ - Защита\n☝️ - Вверх\n✌️ - Вправо\n🤟 - Влево\n🖐️ - Вниз');
}

function exitGame() {
    if (confirm('Выйти из игры?')) {
        window.close();
    }
}

// Запуск игры
let game;
window.addEventListener('DOMContentLoaded', () => {
    game = new HandGestureGame();
});

// Обработка выхода из полноэкранного режима
document.addEventListener('fullscreenchange', () => {
    if (!document.fullscreenElement) {
        const btn = document.getElementById('fullscreen');
        btn.textContent = '📺 НА ВЕСЬ ЭКРАН';
    }
});
