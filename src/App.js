import React, { useState } from 'react';
import { FilePond, registerPlugin } from 'react-filepond';
import { AnnotationViewer } from 'react-mindee-js';
import { EditPencil, Cancel, Check } from 'iconoir-react';
import 'filepond/dist/filepond.min.css';
import './App.css';
import FilePondPluginFileEncode from 'filepond-plugin-file-encode';

// Register the plugin
registerPlugin(FilePondPluginFileEncode);

function App() {
  const [apiKey, setApiKey] = useState('');
  const [files, setFiles] = useState([]);
  const [invoicePrediction, setInvoicePrediction] = useState(null);
  const [visionPrediction, setVisionPrediction] = useState(null);
  const [serverError, setServerError] = useState(null);
  const [mindeeData, setMindeeData] = useState(null);
  const [editIndex, setEditIndex] = useState(null);
  const [features, setFeatures] = useState([]);
  const [annotationData, setAnnotationData] = useState(null);
  const [editedText, setEditedText] = useState(null);

  let pond = null;

  function handleEdit(index) {
    setEditIndex(index)
    setAnnotationData(visionPrediction); // Switch to vision data
  }

  function handleCancel() {
    setEditIndex(null);
  }

  function handleSave() {
    // Step 1: Update the invoice prediction data with the edited text
    if (editedText !== null && editIndex !== null) {
      const featureBeingEdited = features[editIndex];
      setInvoicePrediction(prevState => {
        const updatedPrediction = { ...prevState };
        if (featureBeingEdited === 'locale') {
          // Assuming the locale field is a special case and needs to be handled differently
          // You might need to update this based on how you want to handle the locale field
          updatedPrediction.document.inference.prediction[featureBeingEdited].language = editedText.split(', ')[0].replace('Language: ', '');
          updatedPrediction.document.inference.prediction[featureBeingEdited].currency = editedText.split(', ')[1].replace('Currency: ', '');
        } else {
          updatedPrediction.document.inference.prediction[featureBeingEdited].value = editedText;
        }
        return updatedPrediction;
      });
    }
  
    // Step 2: Switch back to the invoice data in the AnnotationViewer
    setAnnotationData(prepareInvoiceData(invoicePrediction.document.inference.prediction, features, pond.getFile().getFileEncodeDataURL()));
  
    // Step 3: Reset the edit state to exit the edit mode
    setEditIndex(null);
    setEditedText(null);
  }  

  const getValue = (feature, index) => {
    if (editIndex !== null && editIndex === index) {
      return editedText; // Return the edited text during editing
    }
    const fields = invoicePrediction.document.inference.prediction;
    if (!fields[feature]) {
      return null;
    }

    let value;
    if (feature === 'locale') {
      value = `Language: ${fields[feature].language}, Currency: ${fields[feature].currency}`;
    } else {
      value = fields[feature].value || 'N/A';
    }

    return value;
  }

  const getKey = (feature) => {
    return feature.replace(/([A-Z])/g, ' $1').replace(/^./, (str) => str.toUpperCase());
  }

  const prepareInvoiceData = (prediction, features, image) => {
    const shapes = features.map((feature, index) => {
      if (!prediction[feature] || !prediction[feature].polygon) {
        return null;
      }
      
      return {
        id: index + 1,
        coordinates: prediction[feature].polygon,
      };
    }).filter(shape => shape !== null);
  
    return {
      image: image, 
      shapes: shapes,
    };
  };

  const prepareVisionData = (visionResponse, image) => {
    const shapes = [];
    visionResponse.document.inference.pages.forEach((page, pageIndex) => {
      page.prediction.all_words.forEach((word, wordIndex) => {
        shapes.push({
          id: pageIndex * 1000 + wordIndex, // Unique ID for each word
          coordinates: word.polygon,
          text: word.text,
        });
      });
    });
  
    return {
      image: image, 
      shapes: shapes
    };
  };
  

  const handlePredictions = async () => {
    try {
      // Ensure API key and file are available
      if (!apiKey || !files) {
        throw new Error('API key and file are required');
      }

      if (!pond) {
        throw new Error('Pond not initiated');
      }
  
      // Create a FormData object to hold the file data
      const formData = new FormData();
      formData.append('document', pond.getFile().getFileEncodeBase64String());    
      const image = pond.getFile().getFileEncodeDataURL();
  
  
      // Make the first API call to get the key information
      const invoiceResponse = await fetch('https://api.mindee.net/v1/products/mindee/invoices/v4/predict', {
        method: 'POST',
        headers: {
          'authorization': `Token ${apiKey}`,
        },
        body: formData,
      });
      const invoiceData = await invoiceResponse.json();
      setInvoicePrediction(invoiceData);
      setFeatures(invoiceData.document.inference.product.features);
      console.log(invoiceData);
      console.log(features);

      const preparedInvoiceData = prepareInvoiceData(invoiceData.document.inference.prediction, invoiceData.document.inference.product.features, image);
      setAnnotationData(preparedInvoiceData);
  
      // Make the second API call to get all the text
      const visionResponse = await fetch('https://api.mindee.net/v1/products/mindee/mindee_vision/v1/predict', {
        method: 'POST',
        headers: {
          'authorization': `Token ${apiKey}`,
        },
        body: formData,
      });
      const visionData = await visionResponse.json();
      const preparedVisionData = prepareVisionData(visionData, image);
      setVisionPrediction(preparedVisionData);
    } catch (error) {
      // Handle errors
      setServerError(error.message);
      console.log(error.message);
    }
  };
  
  const handleShapeSelect = (selectedShapes) => {
    console.log(selectedShapes);
    const selectedText = selectedShapes.text;
    setEditedText(selectedText);
  };

  const handleMultiShapeSelect = (selectedShapes) => {
    // Step 1: Get the IDs of the selected shapes
    const selectedShapeTexts = selectedShapes.map(shape => shape.text);

    const concatenatedText = selectedShapeTexts.join(' ');

    // Step 4: Update the state to hold the concatenated text
    setEditedText(concatenatedText);
  };
  

  return (
    <div className="content-container">
    <div className="mindee-container">
      {annotationData && (
        <AnnotationViewer 
          data={annotationData} 
          style={{ width: '100%', height: '100%' }} 
          onShapeClick={handleShapeSelect}
          onShapeMultiSelect={handleMultiShapeSelect}
        />
      )}
    </div>
    <div className="cards-container">
      <div className="api-key-input">
        <label>
          API Key:
          <input type="text" value={apiKey} onChange={(e) => setApiKey(e.target.value)} />
        </label>
      </div>
      <div className="file-upload">
        <FilePond
          files={files}
          ref={(ref) => {
            pond = ref;
          }}
          onupdatefiles={setFiles}
          allowMultiple={false}
          maxFiles={1}
          maxFileSize="10MB"
          allowFileEncode
          acceptedFileTypes={['application/pdf', 'image/tiff', 'image/jpeg', 'image/png', 'image/heic', 'image/webp']}
          labelIdle='Drag & Drop your files or <span class="filepond--label-action">Browse</span>'
        />
        <button onClick={handlePredictions}>Submit</button>
      </div>
      <div className="cards">
        { features && (
          <>
            {features.map((feature, index) => (
              <div className="card" key={index}>
                <div className="key">{getKey(feature)}</div>
                <div className="value">{getValue(feature, index)}</div>
                <div className="edit-button">
                  {editIndex === index ? (
                    <div className="edit-actions">
                      <Cancel onClick={() => handleCancel()} />
                      <Check onClick={() => handleSave()} />
                    </div>
                  ) : (
                    <EditPencil onClick={() => handleEdit(index)} />
                  )}
                </div>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  </div>
  
  );
}

export default App;
