import React, { useState, useEffect } from 'react';
import { 
  collection, 
  query, 
  orderBy, 
  limit, 
  onSnapshot, 
  addDoc, 
  where, 
  Timestamp, 
  startAfter,
  getDocs,
  doc,
  updateDoc,
  increment
} from 'firebase/firestore';
import { db, auth } from './firebase';
import { 
  Search, 
  Filter, 
  Plus, 
  X, 
  MessageSquare, 
  Tag as TagIcon, 
  ChevronRight, 
  ChevronLeft,
  User,
  Clock,
  AlertCircle,
  Share2
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

// --- Utility ---
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Types
interface ForumPost {
  id: string;
  authorId: string;
  authorName: string;
  title: string;
  content: string;
  organRelated: string;
  tags: string[];
  createdAt: string;
  replyCount: number;
}

interface ForumReply {
  id: string;
  postId: string;
  authorId: string;
  authorName: string;
  content: string;
  createdAt: string;
}

const ORGANS = ['General', 'Heart', 'Kidney', 'Lung', 'Stomach', 'Brain', 'Other'];
const TAGS = ['sharing', 'urgent', 'question', 'advice', 'update'];
const POSTS_PER_PAGE = 5;

export default function ForumTab({ userName }: { userName: string }) {
  const [posts, setPosts] = useState<ForumPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterOrgan, setFilterOrgan] = useState('All');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedPost, setSelectedPost] = useState<ForumPost | null>(null);
  const [lastVisible, setLastVisible] = useState<any>(null);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);

  // Create Post State
  const [newPostTitle, setNewPostTitle] = useState('');
  const [newPostContent, setNewPostContent] = useState('');
  const [newPostOrgan, setNewPostOrgan] = useState('General');
  const [newPostTags, setNewPostTags] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    fetchPosts();
  }, [filterOrgan, page]);

  const fetchPosts = async () => {
    setLoading(true);
    try {
      let q = query(
        collection(db, 'forum_posts'),
        orderBy('createdAt', 'desc'),
        limit(POSTS_PER_PAGE)
      );

      if (filterOrgan !== 'All') {
        q = query(
          collection(db, 'forum_posts'),
          where('organRelated', '==', filterOrgan),
          orderBy('createdAt', 'desc'),
          limit(POSTS_PER_PAGE)
        );
      }

      // Handle pagination
      if (page > 1 && lastVisible) {
        q = query(q, startAfter(lastVisible));
      }

      const unsubscribe = onSnapshot(q, (snapshot) => {
        const fetchedPosts = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })) as ForumPost[];
        
        setPosts(fetchedPosts);
        setLastVisible(snapshot.docs[snapshot.docs.length - 1]);
        setHasMore(snapshot.docs.length === POSTS_PER_PAGE);
        setLoading(false);
      }, (error) => {
        console.error("Error fetching posts:", error);
        setLoading(false);
      });

      return () => unsubscribe();
    } catch (error) {
      console.error("Error in fetchPosts:", error);
      setLoading(false);
    }
  };

  const handleCreatePost = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!auth.currentUser || !newPostTitle.trim() || !newPostContent.trim()) return;

    setIsSubmitting(true);
    try {
      const postData = {
        authorId: auth.currentUser.uid,
        authorName: userName || 'Anonymous',
        title: newPostTitle,
        content: newPostContent,
        organRelated: newPostOrgan,
        tags: newPostTags,
        createdAt: new Date().toISOString(),
        replyCount: 0
      };

      await addDoc(collection(db, 'forum_posts'), postData);
      
      // Reset form
      setNewPostTitle('');
      setNewPostContent('');
      setNewPostOrgan('General');
      setNewPostTags([]);
      setShowCreateModal(false);
    } catch (error) {
      console.error("Error creating post:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const toggleTag = (tag: string) => {
    setNewPostTags(prev => 
      prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
    );
  };

  const filteredPosts = posts.filter(post => 
    post.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    post.content.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <motion.div 
      initial={{ opacity: 0, x: 20 }} 
      animate={{ opacity: 1, x: 0 }} 
      exit={{ opacity: 0, x: -20 }} 
      className="space-y-6 pb-24"
    >
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <h1 className="bg-white-600 text-black text-3xl px-5 py-4 rounded-xl font-bold shadow-md flex items-center gap-3">
          <MessageSquare className="text-blue-600" /> Community Forum
        </h1>
        <button 
          onClick={() => setShowCreateModal(true)}
          className="bg-blue-600 text-white px-6 py-3 rounded-2xl font-bold hover:bg-blue-700 transition-all flex items-center gap-2 shadow-lg active:scale-95"
        >
          <Plus size={20} /> Create Post
        </button>
      </div>

      {/* Search and Filter */}
      <div className="bg-white p-4 rounded-3xl border border-slate-100 shadow-sm flex flex-col md:flex-row gap-4">
        <div className="flex-1 relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
          <input 
            type="text"
            placeholder="Search discussions..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-12 pr-4 py-3 rounded-2xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none transition-all"
          />
        </div>
        <div className="flex items-center gap-2 overflow-x-auto pb-2 md:pb-0 no-scrollbar">
          <Filter size={18} className="text-slate-400 shrink-0" />
          <button 
            onClick={() => setFilterOrgan('All')}
            className={cn(
              "px-4 py-2 rounded-xl text-sm font-bold whitespace-nowrap transition-all",
              filterOrgan === 'All' ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            )}
          >
            All
          </button>
          {ORGANS.map(organ => (
            <button 
              key={organ}
              onClick={() => setFilterOrgan(organ)}
              className={cn(
                "px-4 py-2 rounded-xl text-sm font-bold whitespace-nowrap transition-all",
                filterOrgan === organ ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              )}
            >
              {organ}
            </button>
          ))}
        </div>
      </div>

      {/* Posts List */}
      <div className="space-y-4">
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
          </div>
        ) : filteredPosts.length === 0 ? (
          <div className="bg-white p-12 rounded-3xl border border-slate-100 text-center space-y-4">
            <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto text-slate-300">
              <Search size={32} />
            </div>
            <p className="text-slate-500 font-medium italic">No posts found matching your criteria.</p>
          </div>
        ) : (
          filteredPosts.map(post => (
            <PostCard 
              key={post.id} 
              post={post} 
              onClick={() => setSelectedPost(post)} 
            />
          ))
        )}
      </div>

      {/* Pagination */}
      {!loading && filteredPosts.length > 0 && (
        <div className="flex items-center justify-center gap-4 pt-4">
          <button 
            disabled={page === 1}
            onClick={() => setPage(prev => prev - 1)}
            className="p-3 rounded-2xl bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-50 transition-all"
          >
            <ChevronLeft size={20} />
          </button>
          <span className="font-bold text-slate-600">Page {page}</span>
          <button 
            disabled={!hasMore}
            onClick={() => setPage(prev => prev + 1)}
            className="p-3 rounded-2xl bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-50 transition-all"
          >
            <ChevronRight size={20} />
          </button>
        </div>
      )}

      {/* Create Post Modal */}
      <AnimatePresence>
        {showCreateModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-3xl p-8 max-w-2xl w-full shadow-2xl space-y-6 max-h-[90vh] overflow-y-auto"
            >
              <div className="flex items-center justify-between">
                <h2 className="text-2xl font-bold text-slate-900">Create New Post</h2>
                <button onClick={() => setShowCreateModal(false)} className="p-2 hover:bg-slate-100 rounded-full">
                  <X size={24} />
                </button>
              </div>

              <form onSubmit={handleCreatePost} className="space-y-6">
                <div className="space-y-2">
                  <label className="block text-sm font-bold text-slate-700">Title</label>
                  <input 
                    required
                    type="text"
                    value={newPostTitle}
                    onChange={(e) => setNewPostTitle(e.target.value)}
                    placeholder="What's on your mind?"
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="block text-sm font-bold text-slate-700">Category (Organ Related)</label>
                    <select 
                      value={newPostOrgan}
                      onChange={(e) => setNewPostOrgan(e.target.value)}
                      className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none"
                    >
                      {ORGANS.map(organ => (
                        <option key={organ} value={organ}>{organ}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="block text-sm font-bold text-slate-700">Tags</label>
                  <div className="flex flex-wrap gap-2">
                    {TAGS.map(tag => (
                      <button 
                        key={tag}
                        type="button"
                        onClick={() => toggleTag(tag)}
                        className={cn(
                          "px-3 py-1.5 rounded-lg text-xs font-bold transition-all border",
                          newPostTags.includes(tag) 
                            ? "bg-blue-100 text-blue-700 border-blue-200" 
                            : "bg-slate-50 text-slate-500 border-slate-100 hover:bg-slate-100"
                        )}
                      >
                        {tag}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="block text-sm font-bold text-slate-700">Content</label>
                  <textarea 
                    required
                    value={newPostContent}
                    onChange={(e) => setNewPostContent(e.target.value)}
                    placeholder="Share your thoughts, questions, or experiences..."
                    className="w-full h-48 px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none resize-none"
                  />
                </div>

                <div className="flex gap-4 pt-4">
                  <button 
                    type="button"
                    onClick={() => setShowCreateModal(false)}
                    className="flex-1 py-4 rounded-2xl font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-all"
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit"
                    disabled={isSubmitting}
                    className="flex-1 py-4 rounded-2xl font-bold text-white bg-blue-600 hover:bg-blue-700 transition-all disabled:opacity-50"
                  >
                    {isSubmitting ? "Posting..." : "Post Discussion"}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Post Detail Modal */}
      <AnimatePresence>
        {selectedPost && (
          <PostDetailModal 
            post={selectedPost} 
            userName={userName}
            onClose={() => setSelectedPost(null)} 
          />
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function PostCard({ post, onClick }: { post: ForumPost, onClick: () => void }) {
  return (
    <motion.div 
      whileHover={{ y: -2 }}
      onClick={onClick}
      className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm hover:shadow-md transition-all cursor-pointer group"
    >
      <div className="flex justify-between items-start mb-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="px-2 py-1 bg-blue-50 text-blue-600 text-[10px] font-black uppercase rounded-md tracking-wider">
              {post.organRelated}
            </span>
            <div className="flex gap-1">
              {post.tags.map(tag => (
                <span key={tag} className="px-2 py-1 bg-slate-100 text-slate-500 text-[10px] font-bold rounded-md">
                  #{tag}
                </span>
              ))}
            </div>
          </div>
          <h3 className="text-xl font-bold text-slate-900 group-hover:text-blue-600 transition-colors">{post.title}</h3>
        </div>
        <div className="flex items-center gap-1 text-slate-400 text-sm font-bold">
          <MessageSquare size={16} />
          {post.replyCount}
        </div>
      </div>
      
      <p className="text-slate-600 line-clamp-2 mb-4 text-sm leading-relaxed">
        {post.content}
      </p>

      <div className="flex items-center justify-between pt-4 border-t border-slate-50">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-slate-100 rounded-full flex items-center justify-center text-slate-400">
            <User size={16} />
          </div>
          <div>
            <p className="text-xs font-bold text-slate-700">{post.authorName}</p>
            <p className="text-[10px] text-slate-400">{new Date(post.createdAt).toLocaleDateString()}</p>
          </div>
        </div>
        <ChevronRight size={20} className="text-slate-300 group-hover:text-blue-500 transition-all" />
      </div>
    </motion.div>
  );
}

function PostDetailModal({ post, userName, onClose }: { post: ForumPost, userName: string, onClose: () => void }) {
  const [replies, setReplies] = useState<ForumReply[]>([]);
  const [newReply, setNewReply] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const q = query(
      collection(db, 'forum_replies'),
      where('postId', '==', post.id),
      orderBy('createdAt', 'asc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      setReplies(snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as ForumReply[]);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [post.id]);

  const handleReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!auth.currentUser || !newReply.trim()) return;

    setIsSubmitting(true);
    try {
      const replyData = {
        postId: post.id,
        authorId: auth.currentUser.uid,
        authorName: userName || 'Anonymous',
        content: newReply,
        createdAt: new Date().toISOString()
      };

      await addDoc(collection(db, 'forum_replies'), replyData);
      
      // Update reply count on post
      const postRef = doc(db, 'forum_posts', post.id);
      await updateDoc(postRef, {
        replyCount: increment(1)
      });

      setNewReply('');
    } catch (error) {
      console.error("Error posting reply:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <motion.div 
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 20, opacity: 0 }}
        className="bg-slate-50 rounded-3xl max-w-3xl w-full shadow-2xl flex flex-col max-h-[90vh] overflow-hidden"
      >
        {/* Header */}
        <div className="bg-white p-6 border-b border-slate-100 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center">
              <MessageSquare size={20} />
            </div>
            <div>
              <h2 className="font-bold text-slate-900 line-clamp-1">{post.title}</h2>
              <p className="text-xs text-slate-400">Discussion in {post.organRelated}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
            <X size={24} />
          </button>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-6 space-y-8">
          {/* Original Post */}
          <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-slate-100 rounded-full flex items-center justify-center text-slate-400">
                  <User size={20} />
                </div>
                <div>
                  <p className="font-bold text-slate-800">{post.authorName}</p>
                  <p className="text-xs text-slate-400 flex items-center gap-1">
                    <Clock size={12} /> {new Date(post.createdAt).toLocaleString()}
                  </p>
                </div>
              </div>
              <div className="flex gap-1">
                {post.tags.map(tag => (
                  <span key={tag} className="px-2 py-1 bg-slate-50 text-slate-500 text-[10px] font-bold rounded-md border border-slate-100">
                    #{tag}
                  </span>
                ))}
              </div>
            </div>
            <p className="text-slate-700 leading-relaxed whitespace-pre-wrap">
              {post.content}
            </p>
          </div>

          {/* Replies Section */}
          <div className="space-y-4">
            <h3 className="font-bold text-slate-900 flex items-center gap-2 px-2">
              <MessageSquare size={18} className="text-blue-600" />
              Replies ({replies.length})
            </h3>
            
            {loading ? (
              <div className="flex justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              </div>
            ) : replies.length === 0 ? (
              <div className="text-center py-12 bg-white rounded-3xl border border-dashed border-slate-200">
                <p className="text-slate-400 italic text-sm">No replies yet. Be the first to join the discussion!</p>
              </div>
            ) : (
              <div className="space-y-4">
                {replies.map(reply => (
                  <div key={reply.id} className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm space-y-2 ml-4 md:ml-8 relative">
                    <div className="absolute left-[-16px] md:left-[-32px] top-8 w-4 md:w-8 h-[2px] bg-slate-200"></div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 bg-slate-50 rounded-full flex items-center justify-center text-slate-300">
                          <User size={12} />
                        </div>
                        <p className="text-xs font-bold text-slate-700">{reply.authorName}</p>
                      </div>
                      <p className="text-[10px] text-slate-400">{new Date(reply.createdAt).toLocaleString()}</p>
                    </div>
                    <p className="text-sm text-slate-600 leading-relaxed whitespace-pre-wrap">
                      {reply.content}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Reply Input */}
        <div className="bg-white p-6 border-t border-slate-100 shrink-0">
          <form onSubmit={handleReply} className="flex gap-3">
            <textarea 
              required
              value={newReply}
              onChange={(e) => setNewReply(e.target.value)}
              placeholder="Write a reply..."
              className="flex-1 px-4 py-3 rounded-2xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none resize-none h-12 min-h-[48px] max-h-32 transition-all"
            />
            <button 
              type="submit"
              disabled={isSubmitting || !newReply.trim()}
              className="bg-blue-600 text-white px-6 py-3 rounded-2xl font-bold hover:bg-blue-700 disabled:opacity-50 transition-all flex items-center gap-2 shrink-0"
            >
              {isSubmitting ? "..." : "Reply"}
            </button>
          </form>
        </div>
      </motion.div>
    </div>
  );
}
