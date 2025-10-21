import { Audio } from 'expo-av';

class AudioService {
  private static sound: Audio.Sound | null = null;
  private static isLoaded = false;

  // 加载音频文件
  public static async loadSound() {
    try {
      if (!this.isLoaded) {
        const { sound } = await Audio.Sound.createAsync(
          require('../assets/music/newOrderAlert.mp3')
        );
        this.sound = sound;
        this.isLoaded = true;
        console.log('音频文件已加载');
      }
    } catch (error) {
      console.error('加载音频文件失败:', error);
    }
  }

  // 播放新订单提示音
  public static async playNewOrderAlert() {
    try {
      if (!this.isLoaded) {
        await this.loadSound();
      }
      
      if (this.sound) {
        // 确保从头开始播放
        await this.sound.setPositionAsync(0);
        await this.sound.playAsync();
        console.log('正在播放新订单提示音');
      }
    } catch (error) {
      console.error('播放提示音失败:', error);
    }
  }

  // 清理资源
  public static async unloadSound() {
    if (this.sound) {
      await this.sound.unloadAsync();
      this.sound = null;
      this.isLoaded = false;
      console.log('音频资源已释放');
    }
  }
}

export default AudioService;