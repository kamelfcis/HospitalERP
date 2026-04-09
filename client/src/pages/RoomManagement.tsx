import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  Plus,
  Edit2,
  Trash2,
  Loader2,
  Building,
  DoorOpen,
  BedDouble,
  ChevronDown,
  ChevronLeft,
  Tag,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import type { Floor, Room, Bed } from "@shared/schema";

type BedWithPatient = Bed & { patientName?: string };
type RoomWithBeds = Room & { beds: BedWithPatient[] };
type FloorWithRooms = Floor & { rooms: RoomWithBeds[] };

interface FloorRow {
  id: string;
  nameAr: string;
  sortOrder: number;
  departmentId: string | null;
  departmentName: string | null;
  roomCount: number;
  bedCount: number;
}

interface RoomRow {
  id: string;
  nameAr: string;
  roomNumber: string | null;
  serviceId: string | null;
  floorId: string;
  floorNameAr: string;
  serviceNameAr: string | null;
  servicePrice: string | null;
}

interface ServiceOption {
  id: string;
  nameAr: string;
  basePrice: string;
}

type DialogMode = "floor" | "room" | "bed" | null;

export default function RoomManagement() {
  const { toast } = useToast();
  const [expandedFloors, setExpandedFloors] = useState<Set<string>>(new Set());
  const [expandedRooms, setExpandedRooms] = useState<Set<string>>(new Set());
  const [dialogMode, setDialogMode] = useState<DialogMode>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [floorForm, setFloorForm] = useState({ nameAr: "", sortOrder: 0, departmentId: "" });
  const [roomForm, setRoomForm] = useState({ floorId: "", nameAr: "", roomNumber: "", serviceId: "" });
  const [bedForm, setBedForm] = useState({ roomId: "", bedNumber: "" });

  const { data: floorsData, isLoading: floorsLoading } = useQuery<FloorRow[]>({
    queryKey: ["/api/floors"],
  });

  const { data: roomsData, isLoading: roomsLoading } = useQuery<RoomRow[]>({
    queryKey: ["/api/rooms"],
  });

  const { data: bedBoardData } = useQuery<FloorWithRooms[]>({
    queryKey: ["/api/bed-board"],
  });

  const { data: servicesResponse } = useQuery<{ data: ServiceOption[] }>({
    queryKey: ["/api/services", "room-grade"],
    queryFn: () => fetch("/api/services?active=true&search=%D9%82%D8%A7%D9%85&pageSize=200").then(r => r.json()),
  });
  const servicesData = servicesResponse?.data;

  const { data: departments } = useQuery<{ id: string; nameAr: string }[]>({
    queryKey: ["/api/departments"],
  });

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/floors"] });
    queryClient.invalidateQueries({ queryKey: ["/api/rooms"] });
    queryClient.invalidateQueries({ queryKey: ["/api/bed-board"] });
    queryClient.invalidateQueries({ queryKey: ["/api/services", "room-grade"] });
  };

  const createFloor = useMutation({
    mutationFn: (data: Partial<Floor>) => apiRequest("POST", "/api/floors", data),
    onSuccess: () => { invalidateAll(); toast({ title: "تم إضافة الدور بنجاح" }); closeDialog(); },
    onError: (e: Error) => toast({ title: "خطأ", description: e.message, variant: "destructive" }),
  });

  const updateFloor = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Floor> }) => apiRequest("PUT", `/api/floors/${id}`, data),
    onSuccess: () => { invalidateAll(); toast({ title: "تم تحديث الدور" }); closeDialog(); },
    onError: (e: Error) => toast({ title: "خطأ", description: e.message, variant: "destructive" }),
  });

  const deleteFloor = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/floors/${id}`),
    onSuccess: () => { invalidateAll(); toast({ title: "تم حذف الدور" }); },
    onError: (e: Error) => toast({ title: "خطأ", description: e.message, variant: "destructive" }),
  });

  const createRoom = useMutation({
    mutationFn: (data: Partial<Room>) => apiRequest("POST", "/api/rooms", data),
    onSuccess: () => { invalidateAll(); toast({ title: "تم إضافة الغرفة بنجاح" }); closeDialog(); },
    onError: (e: Error) => toast({ title: "خطأ", description: e.message, variant: "destructive" }),
  });

  const updateRoom = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Room> }) => apiRequest("PUT", `/api/rooms/${id}`, data),
    onSuccess: () => { invalidateAll(); toast({ title: "تم تحديث الغرفة" }); closeDialog(); },
    onError: (e: Error) => toast({ title: "خطأ", description: e.message, variant: "destructive" }),
  });

  const deleteRoom = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/rooms/${id}`),
    onSuccess: () => { invalidateAll(); toast({ title: "تم حذف الغرفة" }); },
    onError: (e: Error) => toast({ title: "خطأ", description: e.message, variant: "destructive" }),
  });

  const createBed = useMutation({
    mutationFn: (data: Partial<Bed>) => apiRequest("POST", "/api/beds", data),
    onSuccess: () => { invalidateAll(); toast({ title: "تم إضافة السرير بنجاح" }); closeDialog(); },
    onError: (e: Error) => toast({ title: "خطأ", description: e.message, variant: "destructive" }),
  });

  const deleteBed = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/beds/${id}`),
    onSuccess: () => { invalidateAll(); toast({ title: "تم حذف السرير" }); },
    onError: (e: Error) => toast({ title: "خطأ", description: e.message, variant: "destructive" }),
  });

  const closeDialog = () => {
    setDialogMode(null);
    setEditingId(null);
    setFloorForm({ nameAr: "", sortOrder: 0, departmentId: "" });
    setRoomForm({ floorId: "", nameAr: "", roomNumber: "", serviceId: "" });
    setBedForm({ roomId: "", bedNumber: "" });
  };

  const openAddFloor = () => {
    setDialogMode("floor");
    setEditingId(null);
    setFloorForm({ nameAr: "", sortOrder: (floorsData?.length ?? 0) + 1, departmentId: "" });
  };

  const openEditFloor = (f: FloorRow) => {
    setDialogMode("floor");
    setEditingId(f.id);
    setFloorForm({ nameAr: f.nameAr, sortOrder: f.sortOrder, departmentId: f.departmentId ?? "" });
  };

  const openAddRoom = (floorId: string) => {
    setDialogMode("room");
    setEditingId(null);
    setRoomForm({ floorId, nameAr: "", roomNumber: "", serviceId: "" });
  };

  const openEditRoom = (r: RoomRow) => {
    setDialogMode("room");
    setEditingId(r.id);
    setRoomForm({ floorId: r.floorId, nameAr: r.nameAr, roomNumber: r.roomNumber || "", serviceId: r.serviceId || "" });
  };

  const openAddBed = (roomId: string) => {
    setDialogMode("bed");
    setEditingId(null);
    setBedForm({ roomId, bedNumber: "" });
  };

  const toggleFloor = (id: string) => {
    setExpandedFloors(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleRoom = (id: string) => {
    setExpandedRooms(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const handleSubmit = () => {
    if (dialogMode === "floor") {
      if (!floorForm.nameAr.trim()) {
        toast({ title: "خطأ", description: "اسم الدور مطلوب", variant: "destructive" });
        return;
      }
      const floorPayload = {
        ...floorForm,
        departmentId: floorForm.departmentId || null,
      };
      if (editingId) {
        updateFloor.mutate({ id: editingId, data: floorPayload });
      } else {
        createFloor.mutate(floorPayload);
      }
    } else if (dialogMode === "room") {
      if (!roomForm.nameAr.trim()) {
        toast({ title: "خطأ", description: "اسم الغرفة مطلوب", variant: "destructive" });
        return;
      }
      if (editingId) {
        updateRoom.mutate({ id: editingId, data: roomForm });
      } else {
        createRoom.mutate(roomForm);
      }
    } else if (dialogMode === "bed") {
      if (!bedForm.bedNumber.trim()) {
        toast({ title: "خطأ", description: "رقم السرير مطلوب", variant: "destructive" });
        return;
      }
      createBed.mutate(bedForm);
    }
  };

  const getRoomsForFloor = (floorId: string) => {
    return roomsData?.filter(r => r.floorId === floorId) || [];
  };

  const getBedsForRoom = (roomId: string) => {
    if (!bedBoardData) return [];
    for (const floor of bedBoardData) {
      for (const room of floor.rooms || []) {
        if (room.id === roomId) return room.beds || [];
      }
    }
    return [];
  };

  const isMutating = createFloor.isPending || updateFloor.isPending || createRoom.isPending ||
    updateRoom.isPending || createBed.isPending;

  if (floorsLoading || roomsLoading) {
    return (
      <div className="p-3 space-y-3">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const floors = floorsData || [];

  return (
    <div className="p-3 space-y-3" dir="rtl">
      <div className="peachtree-toolbar flex items-center justify-between flex-wrap gap-2 rounded">
        <div>
          <h1 className="text-sm font-bold text-foreground flex items-center gap-1" data-testid="text-page-title">
            <Building className="h-4 w-4" />
            إدارة الأدوار والغرف والأسرّة
          </h1>
          <p className="text-xs text-muted-foreground">
            {floors.length} دور — {roomsData?.length || 0} غرفة
          </p>
        </div>
        <Button size="sm" onClick={openAddFloor} className="h-7 text-xs px-3" data-testid="button-add-floor">
          <Plus className="h-3 w-3 ml-1" />
          دور جديد
        </Button>
      </div>

      <ScrollArea className="h-[calc(100vh-160px)]">
        <div className="space-y-2">
          {floors.length === 0 && (
            <div className="text-center py-12 text-muted-foreground text-sm" data-testid="text-empty-state">
              لا توجد أدوار — ابدأ بإضافة دور جديد
            </div>
          )}

          {floors.map(floor => {
            const isExpanded = expandedFloors.has(floor.id);
            const floorRooms = getRoomsForFloor(floor.id);

            return (
              <div key={floor.id} className="border rounded-lg bg-card" data-testid={`floor-card-${floor.id}`}>
                <div
                  className="flex items-center justify-between px-3 py-2.5 cursor-pointer hover:bg-accent/50 transition-colors rounded-t-lg"
                  onClick={() => toggleFloor(floor.id)}
                  data-testid={`button-toggle-floor-${floor.id}`}
                >
                  <div className="flex items-center gap-2">
                    {isExpanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronLeft className="h-4 w-4 text-muted-foreground" />}
                    <Building className="h-4 w-4 text-primary" />
                    <span className="text-sm font-semibold" data-testid={`text-floor-name-${floor.id}`}>{floor.nameAr}</span>
                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0" data-testid={`text-floor-stats-${floor.id}`}>
                      {floor.roomCount} غرفة — {floor.bedCount} سرير
                    </Badge>
                    {floor.departmentName && (
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-blue-300 text-blue-700 dark:text-blue-400" data-testid={`text-floor-dept-${floor.id}`}>
                        {floor.departmentName}
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                    <Button variant="ghost" size="icon" className="h-6 w-6"
                      onClick={() => openAddRoom(floor.id)} data-testid={`button-add-room-${floor.id}`}>
                      <Plus className="h-3 w-3" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-6 w-6"
                      onClick={() => openEditFloor(floor)} data-testid={`button-edit-floor-${floor.id}`}>
                      <Edit2 className="h-3 w-3" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-6 w-6"
                      onClick={() => {
                        if (confirm("هل أنت متأكد من حذف هذا الدور وجميع غرفه وأسرّته؟"))
                          deleteFloor.mutate(floor.id);
                      }} data-testid={`button-delete-floor-${floor.id}`}>
                      <Trash2 className="h-3 w-3 text-destructive" />
                    </Button>
                  </div>
                </div>

                {isExpanded && (
                  <div className="px-3 pb-3 space-y-1.5">
                    {floorRooms.length === 0 && (
                      <div className="text-xs text-muted-foreground py-3 text-center" data-testid={`text-no-rooms-${floor.id}`}>
                        لا توجد غرف في هذا الدور
                      </div>
                    )}

                    {floorRooms.map(room => {
                      const isRoomExpanded = expandedRooms.has(room.id);
                      const beds = getBedsForRoom(room.id);

                      return (
                        <div key={room.id} className="border rounded bg-background" data-testid={`room-card-${room.id}`}>
                          <div
                            className="flex items-center justify-between px-2.5 py-2 cursor-pointer hover:bg-accent/30 transition-colors"
                            onClick={() => toggleRoom(room.id)}
                            data-testid={`button-toggle-room-${room.id}`}
                          >
                            <div className="flex items-center gap-2">
                              {isRoomExpanded ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronLeft className="h-3.5 w-3.5 text-muted-foreground" />}
                              <DoorOpen className="h-3.5 w-3.5 text-blue-500" />
                              <span className="text-xs font-medium" data-testid={`text-room-name-${room.id}`}>{room.nameAr}</span>
                              {room.roomNumber && (
                                <span className="text-[10px] text-muted-foreground font-mono" data-testid={`text-room-number-${room.id}`}>
                                  ({room.roomNumber})
                                </span>
                              )}
                              {room.serviceNameAr ? (
                                <Badge variant="outline" className="text-[10px] px-1.5 py-0 gap-0.5 border-green-300 text-green-700 dark:text-green-400" data-testid={`badge-room-grade-${room.id}`}>
                                  <Tag className="h-2.5 w-2.5" />
                                  {room.serviceNameAr} — {Number(room.servicePrice).toLocaleString()} ج.م
                                </Badge>
                              ) : (
                                <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-amber-300 text-amber-600 dark:text-amber-400" data-testid={`badge-room-no-grade-${room.id}`}>
                                  بدون درجة
                                </Badge>
                              )}
                              <Badge variant="secondary" className="text-[10px] px-1 py-0">
                                {beds.length} سرير
                              </Badge>
                            </div>
                            <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                              <Button variant="ghost" size="icon" className="h-6 w-6"
                                onClick={() => openAddBed(room.id)} data-testid={`button-add-bed-${room.id}`}>
                                <Plus className="h-3 w-3" />
                              </Button>
                              <Button variant="ghost" size="icon" className="h-6 w-6"
                                onClick={() => openEditRoom(room)} data-testid={`button-edit-room-${room.id}`}>
                                <Edit2 className="h-3 w-3" />
                              </Button>
                              <Button variant="ghost" size="icon" className="h-6 w-6"
                                onClick={() => {
                                  if (confirm("هل أنت متأكد من حذف هذه الغرفة وجميع أسرّتها؟"))
                                    deleteRoom.mutate(room.id);
                                }} data-testid={`button-delete-room-${room.id}`}>
                                <Trash2 className="h-3 w-3 text-destructive" />
                              </Button>
                            </div>
                          </div>

                          {isRoomExpanded && beds.length > 0 && (
                            <div className="px-3 pb-2">
                              <div className="flex flex-wrap gap-1.5">
                                {beds.map((bed) => {
                                  const statusStyles: Record<string, string> = {
                                    EMPTY: "border-green-300 bg-green-50 text-green-700 dark:bg-green-950/30 dark:text-green-400 dark:border-green-700",
                                    OCCUPIED: "border-blue-300 bg-blue-50 text-blue-700 dark:bg-blue-950/30 dark:text-blue-400 dark:border-blue-700",
                                    NEEDS_CLEANING: "border-amber-300 bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-700",
                                    MAINTENANCE: "border-red-300 bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-400 dark:border-red-700",
                                  };
                                  const statusLabels: Record<string, string> = {
                                    EMPTY: "فارغ",
                                    OCCUPIED: "مشغول",
                                    NEEDS_CLEANING: "يحتاج تنظيف",
                                    MAINTENANCE: "صيانة",
                                  };
                                  const style = statusStyles[bed.status] || statusStyles.EMPTY;
                                  return (
                                    <div
                                      key={bed.id}
                                      className={`flex items-center gap-1.5 border rounded px-2 py-1.5 text-xs ${style}`}
                                      data-testid={`bed-item-${bed.id}`}
                                    >
                                      <BedDouble className="h-3 w-3" />
                                      <span className="font-medium">{bed.bedNumber}</span>
                                      <span className="text-[10px]">({statusLabels[bed.status] || bed.status})</span>
                                      {bed.patientName && (
                                        <span className="text-[10px] font-medium mr-1" data-testid={`text-bed-patient-${bed.id}`}>
                                          — {bed.patientName}
                                        </span>
                                      )}
                                      {bed.status !== "OCCUPIED" && (
                                        <Button variant="ghost" size="icon" className="h-5 w-5 -mr-1"
                                          onClick={() => {
                                            if (confirm(`حذف السرير ${bed.bedNumber}؟`))
                                              deleteBed.mutate(bed.id);
                                          }} data-testid={`button-delete-bed-${bed.id}`}>
                                          <Trash2 className="h-2.5 w-2.5 text-destructive" />
                                        </Button>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}

                          {isRoomExpanded && beds.length === 0 && (
                            <div className="px-3 pb-2 text-xs text-muted-foreground text-center py-2" data-testid={`text-no-beds-${room.id}`}>
                              لا توجد أسرّة — اضغط + لإضافة سرير
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </ScrollArea>

      <Dialog open={dialogMode !== null} onOpenChange={() => closeDialog()}>
        <DialogContent className="max-w-sm p-4" dir="rtl">
          <DialogHeader className="pb-2">
            <DialogTitle className="text-sm font-bold" data-testid="text-dialog-title">
              {dialogMode === "floor" && (editingId ? "تعديل دور" : "إضافة دور جديد")}
              {dialogMode === "room" && (editingId ? "تعديل غرفة" : "إضافة غرفة جديدة")}
              {dialogMode === "bed" && "إضافة سرير جديد"}
            </DialogTitle>
          </DialogHeader>

          <div className="grid gap-3 py-2">
            {dialogMode === "floor" && (
              <>
                <div className="space-y-1">
                  <Label className="text-xs">اسم الدور *</Label>
                  <input
                    value={floorForm.nameAr}
                    onChange={e => setFloorForm({ ...floorForm, nameAr: e.target.value })}
                    placeholder="مثال: الدور الأول"
                    className="peachtree-input w-full text-xs"
                    autoFocus
                    data-testid="input-floor-name"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">ترتيب العرض</Label>
                  <input
                    type="number"
                    value={floorForm.sortOrder}
                    onChange={e => setFloorForm({ ...floorForm, sortOrder: Number(e.target.value) })}
                    className="peachtree-input w-full text-xs font-mono"
                    data-testid="input-floor-sort"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">القسم (اختياري)</Label>
                  <Select
                    value={floorForm.departmentId || "__none__"}
                    onValueChange={v => setFloorForm({ ...floorForm, departmentId: v === "__none__" ? "" : v })}
                  >
                    <SelectTrigger className="h-8 text-xs" data-testid="select-floor-department">
                      <SelectValue placeholder="بدون قسم" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">بدون قسم</SelectItem>
                      {departments?.map(d => (
                        <SelectItem key={d.id} value={d.id}>{d.nameAr}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}

            {dialogMode === "room" && (
              <>
                <div className="space-y-1">
                  <Label className="text-xs">اسم الغرفة *</Label>
                  <input
                    value={roomForm.nameAr}
                    onChange={e => setRoomForm({ ...roomForm, nameAr: e.target.value })}
                    placeholder="مثال: غرفة 101"
                    className="peachtree-input w-full text-xs"
                    autoFocus
                    data-testid="input-room-name"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">رقم الغرفة</Label>
                  <input
                    value={roomForm.roomNumber}
                    onChange={e => setRoomForm({ ...roomForm, roomNumber: e.target.value })}
                    placeholder="مثال: 101"
                    className="peachtree-input w-full text-xs font-mono"
                    data-testid="input-room-number"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">درجة الغرفة (الخدمة)</Label>
                  <Select
                    value={roomForm.serviceId || "__none__"}
                    onValueChange={v => setRoomForm({ ...roomForm, serviceId: v === "__none__" ? "" : v })}
                  >
                    <SelectTrigger className="h-8 text-xs" data-testid="select-room-grade">
                      <SelectValue placeholder="اختر درجة الغرفة" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">بدون درجة</SelectItem>
                      {servicesData?.map(s => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.nameAr} — {Number(s.basePrice).toLocaleString()} ج.م
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}

            {dialogMode === "bed" && (
              <div className="space-y-1">
                <Label className="text-xs">رقم/اسم السرير *</Label>
                <input
                  value={bedForm.bedNumber}
                  onChange={e => setBedForm({ ...bedForm, bedNumber: e.target.value })}
                  placeholder="مثال: B1"
                  className="peachtree-input w-full text-xs font-mono"
                  autoFocus
                  data-testid="input-bed-number"
                />
              </div>
            )}
          </div>

          <DialogFooter className="gap-1 pt-2">
            <Button variant="outline" size="sm" onClick={closeDialog} className="h-7 text-xs px-3" data-testid="button-cancel">
              إلغاء
            </Button>
            <Button
              size="sm"
              onClick={handleSubmit}
              disabled={isMutating}
              className="h-7 text-xs px-3"
              data-testid="button-save"
            >
              {isMutating ? (
                <><Loader2 className="h-3 w-3 animate-spin ml-1" /> جاري الحفظ...</>
              ) : editingId ? "تحديث" : "إضافة"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
