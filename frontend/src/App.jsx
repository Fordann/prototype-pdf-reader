import { useState, useCallback } from "react";
import "./App.css";
import UploadScreen from "./components/UploadScreen";
import PDFViewer from "./components/PDFViewer";

function App() {
  const [currentDoc, setCurrentDoc] = useState(null);

  const handleDocOpen = useCallback((doc) => {
    setCurrentDoc(doc);
  }, []);

  const handleBack = useCallback(() => {
    setCurrentDoc(null);
  }, []);

  if (!currentDoc) {
    return (
      <div className="app">
        <UploadScreen onDocOpen={handleDocOpen} />
      </div>
    );
  }

  return (
    <div className="app">
      <PDFViewer doc={currentDoc} onBack={handleBack} />
    </div>
  );
}

export default App;
