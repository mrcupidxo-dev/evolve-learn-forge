import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { FileText, Upload, X, Sparkles, Loader2 } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const CreateLesson = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [prompt, setPrompt] = useState("");
  const [difficulty, setDifficulty] = useState<"beginner" | "intermediate" | "advanced">("beginner");
  const [files, setFiles] = useState<File[]>([]);
  const [loading, setLoading] = useState(false);

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
      // Convert files to base64 for processing
      const fileContents: string[] = [];
      for (const file of files) {
        const text = await file.text();
        fileContents.push(text);
      }

      // Call edge function to generate learning path structure
      const { data, error } = await supabase.functions.invoke("generate-learning-path", {
        body: {
          prompt: prompt.trim(),
          fileContents,
          difficulty,
        },
      });

      if (error) throw error;

      toast({
        title: "Learning path created!",
        description: "Your personalized roadmap is ready",
      });

      navigate(`/learning-path/${data.pathId}`);
    } catch (error: any) {
      console.error("Error creating learning path:", error);
      toast({
        title: "Failed to create path",
        description: error.message || "Please try again",
        variant: "destructive",
      });
    } finally {
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

            <Button
              onClick={handleCreatePath}
              disabled={loading}
              className="w-full bg-gradient-primary hover:opacity-90 text-white font-semibold shadow-md h-12"
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Generating your learning path...
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
