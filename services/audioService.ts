import { Audio } from 'expo-av';

class AudioService {
  private static newOrderSound: Audio.Sound | null = null;
  private static updateOrderSound: Audio.Sound | null = null;
  private static newOrderLoaded = false;
  private static updateOrderLoaded = false;

  // 加载新订单音效
  private static async loadNewOrderSound() {
    try {
      if (!this.newOrderLoaded) {
        const { sound } = await Audio.Sound.createAsync(
          require('../assets/music/newOrderAlert.mp3')
        );
        this.newOrderSound = sound;
        this.newOrderLoaded = true;
      }
    } catch (error) {
      console.error('加载新订单音效失败:', error);
    }
  }

  // 加载更新订单音效
  private static async loadUpdateOrderSound() {
    try {
      if (!this.updateOrderLoaded) {
        const { sound } = await Audio.Sound.createAsync(
          require('../assets/music/updatedorderalert.mp3')
        );
        this.updateOrderSound = sound;
        this.updateOrderLoaded = true;
      }
    } catch (error) {
      console.error('加载更新订单音效失败:', error);
    }
  }

  // 播放新订单提示音
  public static async playNewOrderAlert() {
    try {
      await this.loadNewOrderSound();
      
      if (this.newOrderSound) {
        await this.newOrderSound.setPositionAsync(0);
        await this.newOrderSound.playAsync();
      }
    } catch (error) {
      console.error('播放新订单提示音失败:', error);
    }
  }

  // 播放更新订单提示音
  public static async playUpdateOrderAlert() {
    try {
      await this.loadUpdateOrderSound();
      
      if (this.updateOrderSound) {
        await this.updateOrderSound.setPositionAsync(0);
        await this.updateOrderSound.playAsync();
      }
    } catch (error) {
      console.error('播放更新订单提示音失败:', error);
    }
  }

  // 清理资源
  public static async unloadSound() {
    if (this.newOrderSound) {
      await this.newOrderSound.unloadAsync();
      this.newOrderSound = null;
      this.newOrderLoaded = false;
    }
    if (this.updateOrderSound) {
      await this.updateOrderSound.unloadAsync();
      this.updateOrderSound = null;
      this.updateOrderLoaded = false;
    }
  }
}

export default AudioService;