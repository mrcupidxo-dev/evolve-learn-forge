import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { FileText, Upload, X, Sparkles, Loader2, Clock } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useJobPolling } from "@/hooks/useJobPolling";
import { Alert, AlertDescription } from "@/components/ui/alert";

const CreateLesson = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [prompt, setPrompt] = useState("");
  const [difficulty, setDifficulty] = useState<"beginner" | "intermediate" | "advanced">("beginner");
  const [files, setFiles] = useState<File[]>([]);
  const [loading, setLoading] = useState(false);

  // Job polling hook
  const { job, isPolling, startPolling } = useJobPolling(
    (completedJob) => {
      // On job completion
      toast({
        title: "Learning path created!",
        description: "Your personalized roadmap is ready",
      });
      navigate(`/learning-path/${completedJob.result_data.learningPathId}`);
    },
    (errorMessage) => {
      // On job error
      toast({
        title: "Failed to create path",
        description: errorMessage,
        variant: "destructive",
      });
      setLoading(false);
    }
  );

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setFiles(Array.from(e.target.files));
    }
  };

  const removeFile = (index: number) => {
    setFiles(files.filter((_, i) => i !== index));
  };

  const handleCreatePath = async () => {
    if (!prompt.trim() && files.length === 0) {
      toast({
        title: "Input required",
        description: "Please provide a prompt or upload files",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);

    try {
      // Convert files to text for processing
      let fileContents = "";
      for (const file of files) {
        try {
          const text = await file.text();
          fileContents += `File: ${file.name}\n${text}\n\n`;
        } catch (err) {
          console.error(`Error reading file ${file.name}:`, err);
          toast({
            title: "File read error",
            description: `Could not read ${file.name}. Please try a different file format.`,
            variant: "destructive",
          });
        }
      }

      // Call new job-based edge function
      const { data, error } = await supabase.functions.invoke("create-path-job", {
        body: {
          prompt: prompt.trim(),
          fileContents: fileContents || undefined,
          difficulty,
          fileName: files[0]?.name,
          fileSize: files[0]?.size,
          mimeType: files[0]?.type,
        },
      });

      if (error) {
        // Check for rate limit error
        if (error.message?.includes('Rate limit')) {
          toast({
            title: "Rate limit exceeded",
            description: error.message,
            variant: "destructive",
          });
          setLoading(false);
          return;
        }
        throw error;
      }

      // Start polling for job completion
      console.log('Job created, starting polling:', data.jobId);
      startPolling(data.jobId);
      
      toast({
        title: "Generation started",
        description: "Your learning path is being created. This may take 30-60 seconds.",
      });

    } catch (error: any) {
      console.error("Error creating learning path:", error);
      toast({
        title: "Failed to create path",
        description: error.message || "Please try again",
        variant: "destructive",
      });
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-primary/5 to-accent/5 p-6">
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="text-center space-y-2">
          <h1 className="text-4xl font-bold bg-gradient-primary bg-clip-text text-transparent">
            Create Your Learning Path
          </h1>
          <p className="text-muted-foreground text-lg">
            AI-powered lessons tailored to your needs
          </p>
        </div>

        <Card className="shadow-lg">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-primary" />
              What do you want to learn?
            </CardTitle>
            <CardDescription>
              Provide a topic, upload files, or do both for a customized learning experience
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <Tabs defaultValue="prompt" className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="prompt">Text Prompt</TabsTrigger>
                <TabsTrigger value="files">Upload Files</TabsTrigger>
              </TabsList>
              <TabsContent value="prompt" className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="prompt">Learning Topic</Label>
                  <Textarea
                    id="prompt"
                    placeholder="e.g., Full Stack Web Development, Python for Data Science, UI/UX Design..."
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    rows={5}
                    className="resize-none"
                  />
                </div>
              </TabsContent>
              <TabsContent value="files" className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="file-upload">Upload Learning Materials</Label>
                  <div className="border-2 border-dashed border-border rounded-lg p-8 text-center hover:border-primary transition-colors cursor-pointer">
                    <input
                      id="file-upload"
                      type="file"
                      multiple
                      onChange={handleFileChange}
                      className="hidden"
                      accept=".txt,.pdf,.doc,.docx,.md"
                    />
                    <label htmlFor="file-upload" className="cursor-pointer">
                      <Upload className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                      <p className="text-sm text-muted-foreground">
                        Click to upload or drag and drop
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        PDF, DOC, TXT, or MD files
                      </p>
                    </label>
                  </div>
                </div>

                {files.length > 0 && (
                  <div className="space-y-2">
                    <Label>Selected Files ({files.length})</Label>
                    <div className="space-y-2">
                      {files.map((file, index) => (
                        <div
                          key={index}
                          className="flex items-center justify-between p-3 bg-muted rounded-lg"
                        >
                          <div className="flex items-center gap-2">
                            <FileText className="w-4 h-4 text-primary" />
                            <span className="text-sm font-medium">{file.name}</span>
                            <span className="text-xs text-muted-foreground">
                              ({(file.size / 1024).toFixed(1)} KB)
                            </span>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => removeFile(index)}
                            className="h-8 w-8 p-0"
                          >
                            <X className="w-4 h-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </TabsContent>
            </Tabs>

            <div className="space-y-2">
              <Label>Difficulty Level</Label>
              <Select value={difficulty} onValueChange={(v) => setDifficulty(v as any)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="beginner">Beginner - Start from basics</SelectItem>
                  <SelectItem value="intermediate">Intermediate - Build on existing knowledge</SelectItem>
                  <SelectItem value="advanced">Advanced - Deep dive into complex topics</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Job Status Indicator */}
            {(loading || isPolling) && job && (
              <Alert className="border-primary/20 bg-primary/5">
                <Clock className="h-4 w-4" />
                <AlertDescription>
                  <div className="space-y-1">
                    <p className="font-medium">
                      {job.status === 'pending' && 'Waiting in queue...'}
                      {job.status === 'processing' && 'Generating your learning path...'}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      This may take 30-60 seconds. Please don't close this page.
                    </p>
                  </div>
                </AlertDescription>
              </Alert>
            )}

            <Button
              onClick={handleCreatePath}
              disabled={loading || isPolling}
              className="w-full bg-gradient-primary hover:opacity-90 text-white font-semibold shadow-md h-12"
            >
              {(loading || isPolling) ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="w-5 h-5 animate-spin" />
                  {isPolling ? 'Creating lessons...' : 'Starting generation...'}
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  <Sparkles className="w-5 h-5" />
                  Generate Learning Path
                </span>
              )}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default CreateLesson;
