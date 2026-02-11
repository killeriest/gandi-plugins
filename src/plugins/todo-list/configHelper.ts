import { RuntimeFixed, Todo } from "./types";
/**
 * 提供类似 localStorage 的键值对存储接口，支持协作同步
 * @author skydog221
 * @license MPL-2.0
 */

class ScratchConfigStorage {
  runtime: RuntimeFixed;

  extensionId: string;
  extensionName: string;
  commentId: string;
  stage: Scratch.RenderTarget;
  constructor(runtime: RuntimeFixed, extensionId: string, extensionName = extensionId) {
    this.runtime = runtime;
    this.extensionId = extensionId;
    this.extensionName = extensionName;
    this.commentId = `_ExtConfig_${extensionId}`;

    this.stage = this.runtime.getTargetForStage();
  }

  /**
   * 查找扩展配置的注释（在舞台区）
   * @returns {Object|undefined} 注释对象
   */
  findConfigComment() {
    const stage = this.stage;
    if (!stage || !stage.comments) return undefined;
    return stage.comments[this.commentId];
  }

  /**
   * 从注释获取所有扩展配置
   * @returns {Object|undefined} 配置对象
   */
  getAllConfig() {
    const comment = this.findConfigComment();
    if (!comment) return undefined;

    const lines = comment.text.split("\n");
    if (lines.length === 0) {
      console.warn(`${this.extensionId}: Config comment does not contain valid line.`);
      return undefined;
    }

    // 配置信息存在最后一行
    const jsonText = lines[lines.length - 1];
    try {
      const parsed = JSON.parse(jsonText);
      if (!parsed || typeof parsed !== "object") {
        throw new Error("Invalid object");
      }
      return parsed;
    } catch (e) {
      console.warn(`${this.extensionId}: Config comment has invalid JSON`, e);
      return undefined;
    }
  }

  /**
   * 保存所有配置到注释
   * @param {Object} config 配置对象
   */
  saveAllConfig(config: any) {
    const existingComment = this.findConfigComment();
    if (existingComment) {
      const lines = existingComment.text.split("\n");
      if (lines.length === 0) {
        lines.push("");
      }
      // 配置信息存在最后一行
      lines[lines.length - 1] = JSON.stringify(config);
      existingComment.text = lines.join("\n");
      // 同步注释变更到协作端
      this.runtime.emitTargetCommentsChanged(this.stage.id, ["update", this.commentId, { text: existingComment.text }]);
    } else {
      const target = this.runtime.getTargetForStage();
      // TODO: smarter position logic
      const tipText = `${this.extensionName} 插件配置\n你可以移动或缩放此注释，但请勿移出舞台。不建议直接编辑该注释。删除将清空该拓展所有配置\n`;
      const text = `${tipText}\n${JSON.stringify(config)}`;
      target.createComment(this.commentId, null, text, 1, 1, 400, 200, false);
      // 同步注释变更到协作端
      this.runtime.emitTargetCommentsChanged(this.stage.id, ["update", this.commentId, { text }]);
    }

    this.runtime.emitProjectChanged();
  }

  // ************ CRUD 接口 ************

  /**
   * 创建或更新配置项
   * @param {string} key 键名
   * @param {*} value 值
   * @returns {boolean} 是否成功
   */
  setItem(key: string, value: Todo[]) {
    try {
      let config = this.getAllConfig();
      if (!config) config = {};

      config[key] = value;
      this.saveAllConfig(config);
      return true;
    } catch (e) {
      console.error(`Failed to set item ${key}:`, e);
      return false;
    }
  }

  /**
   * 读取配置项
   * @param {string} key 键名
   * @param {*} defaultValue 默认值
   * @returns {*} 配置值
   */
  getItem(key: string, defaultValue = null) {
    const config = this.getAllConfig();
    if (!config) return defaultValue;

    return config[key] !== undefined ? config[key] : defaultValue;
  }

  /**
   * 删除配置项
   * @param {string} key 键名
   * @returns {boolean} 是否成功
   */
  removeItem(key: string) {
    try {
      let config = this.getAllConfig();
      if (!config || !(key in config)) return false;

      delete config[key];
      this.saveAllConfig(config);
      return true;
    } catch (e) {
      console.error(`Failed to remove item ${key}:`, e);
      return false;
    }
  }

  /**
   * 清空所有配置
   * @returns {boolean} 是否成功
   */
  clear() {
    try {
      // 查找配置注释
      const comment = this.findConfigComment();
      // 如果找到配置注释
      if (comment) {
        // 将注释文本按行分割
        const lines = comment.text.split("\n");
        // 如果分割后的行数大于0
        if (lines.length > 0) {
          lines[lines.length - 1] = JSON.stringify({});
          comment.text = lines.join("\n");
          // 同步注释变更到协作端
          this.runtime.emitTargetCommentsChanged(this.stage.id, ["update", this.commentId, { text: comment.text }]);
          this.runtime.emitProjectChanged();
        }
      }
      return true;
    } catch (e) {
      console.error("Failed to clear config:", e);
      return false;
    }
  }

  /**
   * 检查是否存在某个配置项
   * @param {string} key 键名
   * @returns {boolean} 是否存在
   */
  hasItem(key: string) {
    const config = this.getAllConfig();
    return config && key in config;
  }

  /**
   * 获取所有配置项的键名
   * @returns {string[]} 键名数组
   */
  keys() {
    const config = this.getAllConfig();
    return config ? Object.keys(config) : [];
  }

  /**
   * 获取配置项数量
   * @returns {number} 配置项数量
   */
  length() {
    const config = this.getAllConfig();
    return config ? Object.keys(config).length : 0;
  }
}

export default ScratchConfigStorage;
