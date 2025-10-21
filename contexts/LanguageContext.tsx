import React, { createContext, useState, useContext, useEffect } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  translations,
  SupportedLanguage,
  getDefaultLanguage,
} from "../constants/translations";

// 定义语言上下文类型
interface LanguageContextType {
  language: SupportedLanguage;
  t: (key: string) => string;
  changeLanguage: (lang: SupportedLanguage) => Promise<void>;
}

// 创建语言上下文
const LanguageContext = createContext<LanguageContextType>({
  language: "en",
  t: (key: string) => key,
  changeLanguage: async () => {},
});

// 语言提供者组件
export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [language, setLanguage] =
    useState<SupportedLanguage>(getDefaultLanguage());

  // 加载保存的语言设置
  useEffect(() => {
    const loadLanguage = async () => {
      try {
        const savedLanguage = await AsyncStorage.getItem("app_language");
        if (savedLanguage === "en" || savedLanguage === "zh") {
          setLanguage(savedLanguage);
        }
      } catch (error) {
        console.error("加载语言设置失败:", error);
      }
    };

    loadLanguage();
  }, []);

  // 翻译函数
  const t = (key: string): string => {
    return (
      translations[language][
        key as keyof (typeof translations)[typeof language]
      ] || key
    );
  };

  // 更改语言
  const changeLanguage = async (lang: SupportedLanguage) => {
    setLanguage(lang);
    try {
      await AsyncStorage.setItem("app_language", lang);
    } catch (error) {
      console.error("保存语言设置失败:", error);
    }
  };

  return (
    <LanguageContext.Provider value={{ language, t, changeLanguage }}>
      {children}
    </LanguageContext.Provider>
  );
};

// 使用语言的Hook
export const useLanguage = () => useContext(LanguageContext);
