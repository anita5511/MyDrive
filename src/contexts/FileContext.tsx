//src/contexts/FileContext.tsx
import React, { createContext, useState, useContext, useEffect, useCallback, ReactNode } from 'react';
import axios from 'axios';
import { useAuth } from './AuthContext';
import { API_URL } from '../config';

export interface FileItem {
  id: string;
  name: string;
  type: string;
  size: number;
  created_at: string;
  updated_at: string;
  owner_id: string;
  is_shared: boolean;
}

interface FileContextType {
  files: FileItem[];
  loading: boolean;
  error: string | null;
  selectedFile: FileItem | null;
  fetchFiles: () => Promise<void>;
  uploadFile: (
    file: File,
    opts?: { signal?: AbortSignal; onUploadProgress?: (e: ProgressEvent) => void }
  ) => Promise<void>;
  uploading: boolean;
  uploadProgress: number;
  cancelUpload: () => void;
  deleteFile: (fileId: string) => Promise<void>;
  downloadFile: (fileId: string) => Promise<void>;
  getFileContent: (fileId: string) => Promise<string>;
  updateFileContent: (fileId: string, content: string) => Promise<void>;
  shareFile: (fileId: string) => Promise<string>;
  joinTeam: (token: string) => Promise<void>;
  setSelectedFile: (file: FileItem | null) => void;
}

const FileContext = createContext<FileContextType>({
  files: [],
  loading: false,
  error: null,
  selectedFile: null,
  fetchFiles: async () => {},
  uploadFile: async () => {},
  deleteFile: async () => {},
  downloadFile: async () => {},
  getFileContent: async () => '',
  updateFileContent: async () => {},
  shareFile: async () => '',
  joinTeam: async () => {},
  setSelectedFile: () => {},
  uploading: false,
  uploadProgress: 0,
  cancelUpload: () => {},
});

export const useFiles = () => useContext(FileContext);

interface FileProviderProps {
  children: ReactNode;
}

export const FileProvider: React.FC<FileProviderProps> = ({ children }) => {
  const [files, setFiles] = useState<FileItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  // ⬇️ track progress & controller globally
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadController, setUploadController] = useState<AbortController | null>(null);
  const [selectedFile, setSelectedFile] = useState<FileItem | null>(null);
  const { token } = useAuth();

  const authHeaders = {
    headers: { Authorization: `Bearer ${token}` },
  };

  useEffect(() => {
    if (token) {
      fetchFiles();
    }
  }, [token]);

  const fetchFiles = useCallback(async () => {
    if (!token) return;
    
    try {
      setLoading(true);
      const response = await axios.get(`${API_URL}/api/files`, authHeaders);
     // Sort so newest uploads (by created_at) appear first
      const sorted = response.data.files.sort(
        (a: FileItem, b: FileItem) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
      setFiles(sorted);
    } catch (err: any) {
      if (err.response?.status === 403) {
        // Not authorized
        const e = new Error('not-authorized');
        throw e;
      }
      // if the server returned 403, bubble up a special "not-authorized" error
      if (err.response?.status === 403) {
        throw new Error('not-authorized');
      }
      setError(err.response?.data?.message || 'Failed to get file content');
      throw err;
    } finally {
      setLoading(false);
    }
  }, [token]);    // only re-create when token changes

  const uploadFile = async (
    file: File,
    opts?: { signal?: AbortSignal; onUploadProgress?: (e: ProgressEvent) => void }
  ) => {
    // create and hold onto the controller
    const controller = new AbortController();
    setUploadController(controller);
    setUploading(true);
    setUploadProgress(0);
    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await axios.post(
        `${API_URL}/api/files/upload`,
        formData,
        {
          headers: { ...authHeaders.headers, 'Content-Type': 'multipart/form-data' },
          signal: controller.signal,
          onUploadProgress: (e) => {
            if (e.total) {
              const pct = Math.round((e.loaded / e.total) * 100);
              setUploadProgress(pct);
            }
          },
        }
      ); 
      
      setFiles(prev => [response.data.file, ...prev]);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to upload file');
      throw err;
    } finally {
      // cleanup
      setUploading(false);
      setUploadController(null);
    }
  };

  const deleteFile = async (fileId: string) => {
    try {
      setLoading(true);
      // hit the '/delete' endpoint
      await axios.delete(`${API_URL}/api/files/${fileId}/delete`, authHeaders);
      // use functional update to avoid stale closures
      setFiles(prev => prev.filter(file => file.id !== fileId));
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to delete file');
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const downloadFile = async (fileId: string) => {
    try {
      setLoading(true);
      const response = await axios.get(`${API_URL}/api/files/${fileId}/download`, {
        ...authHeaders,
        responseType: 'blob',
      });

      const file = files.find(f => f.id === fileId);
      if (!file) throw new Error('File not found');

      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', file.name);
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to download file');
      console.error('Error downloading file:', err);
    } finally {
      setLoading(false);
    }
  };

  const getFileContent = useCallback(async (fileId: string): Promise<string> => {
    try {
      setLoading(true);
      const response = await axios.get(`${API_URL}/api/files/${fileId}/content`, authHeaders);
      return response.data.content;
    } catch (err: any) {
      // *** THIS BLOCK MUST BE EXACT ***
      if (err.response?.status === 403) {
        // wrap 403 in our sentinel
        throw new Error('not-authorized');
      }
      setError(err.response?.data?.message || 'Failed to get file content');
      throw err;
    } finally {
      setLoading(false);
    }
  }, [token]);

  const updateFileContent = useCallback(async (fileId: string, content: string) => {
    try {
      setLoading(true);
      await axios.put(
        `${API_URL}/api/files/${fileId}/content`,
        { content },
        authHeaders
      );
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to update file content');
      throw err;
    } finally {
      setLoading(false);
    }
  }, [token]);

  const shareFile = async (fileId: string): Promise<string> => {
    try {
      setLoading(true);
      const response = await axios.post(
        `${API_URL}/api/files/${fileId}/share`,
        {},
        authHeaders
      );
      return response.data.token;
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to share file');
      throw err;
    } finally {
      setLoading(false);
    }
  };



  // ← above your return, after shareFile:
  const getShareToken = async (fileId: string): Promise<string> => {
    const response = await axios.get(
      `${API_URL}/api/files/${fileId}/share`,
      authHeaders
    );
    return response.data.token;
  };



  const joinTeam = async (token: string) => {
    try {
      setLoading(true);
      await axios.post(
        `${API_URL}/api/files/join-team`,
        { token },
        authHeaders
      );
      await fetchFiles(); // Refresh files after joining team
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to join team');
      throw err;
    } finally {
      setLoading(false);
    }
  };

  return (
    <FileContext.Provider
      value={{
        files,
        loading,
        error,
        selectedFile,
        fetchFiles,
        uploadFile,
        deleteFile,
        downloadFile,
        getFileContent,
        updateFileContent,
        shareFile,
        getShareToken,
        joinTeam,
        setSelectedFile,
        uploading,
        uploadProgress,
        cancelUpload: () => uploadController?.abort(),
      }}
    >
      {children}
    </FileContext.Provider>
  );
};
