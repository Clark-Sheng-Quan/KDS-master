package com.anonymous.KDS.models;

public class NetworkDevice {
    private String id;           // 服务名称（唯一标识）
    private String ip;           // IP地址
    private int port;            // 端口号
    private String name;         // 设备显示名称
    private boolean locked;      // 是否被锁定（不允许修改）

    // 构造函数 1：基础构造（从NSD发现）
    public NetworkDevice(String id, String ip, int port) {
        this.id = id;
        this.ip = ip;
        this.port = port;
        this.name = id; // 默认使用ID作为名称
        this.locked = false;
    }

    // 构造函数 2：完整构造
    public NetworkDevice(String id, String ip, int port, String name, boolean locked) {
        this.id = id;
        this.ip = ip;
        this.port = port;
        this.name = name != null ? name : id;
        this.locked = locked;
    }

    // Getters and Setters
    public String getId() {
        return id;
    }

    public void setId(String id) {
        this.id = id;
    }

    public String getIp() {
        return ip;
    }

    public void setIp(String ip) {
        this.ip = ip;
    }

    public int getPort() {
        return port;
    }

    public void setPort(int port) {
        this.port = port;
    }

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }

    public boolean isLocked() {
        return locked;
    }

    public void setLocked(boolean locked) {
        this.locked = locked;
    }

    @Override
    public String toString() {
        return "NetworkDevice{" +
                "id='" + id + '\'' +
                ", ip='" + ip + '\'' +
                ", port=" + port +
                ", name='" + name + '\'' +
                ", locked=" + locked +
                '}';
    }
}
