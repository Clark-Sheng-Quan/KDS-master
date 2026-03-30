import React, { createContext, useState, useContext } from "react";

interface ModalContextType {
  hasOpenModal: boolean;
  setHasOpenModal: (open: boolean) => void;
}

const ModalContext = createContext<ModalContextType | undefined>(undefined);

export const ModalProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [hasOpenModal, setHasOpenModal] = useState(false);

  return (
    <ModalContext.Provider value={{ hasOpenModal, setHasOpenModal }}>
      {children}
    </ModalContext.Provider>
  );
};

export const useModalState = () => {
  const context = useContext(ModalContext);
  if (!context) {
    throw new Error("useModalState must be used within ModalProvider");
  }
  return context;
};
